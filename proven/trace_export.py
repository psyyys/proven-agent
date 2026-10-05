"""Readable run logs: turn a run's trace events into a Markdown document for debugging and sharing.

Long outputs are truncated (the full data stays in trace.db); API keys never enter the trace.
"""

from __future__ import annotations

import json
import time
from typing import Any

from . import trace as T
from .trace import TraceStore

OUTPUT_LIMIT = 1500


def list_runs(store: TraceStore, limit: int = 20) -> list[dict[str, Any]]:
    with store._lock:
        rows = store._db.execute(
            """SELECT s.run_id, s.ts, s.data, f.data
               FROM events s LEFT JOIN events f ON f.run_id = s.run_id AND f.type = ?
               WHERE s.type = ? ORDER BY s.ts DESC LIMIT ?""",
            (T.RUN_FINISHED, T.RUN_STARTED, limit),
        ).fetchall()
    out = []
    for run_id, ts, start, finish in rows:
        s = json.loads(start)
        f = json.loads(finish) if finish else {}
        usage = f.get("usage") or {}
        out.append(
            {
                "run_id": run_id,
                "time": time.strftime("%Y-%m-%d %H:%M", time.localtime(ts)),
                "question": s.get("question", ""),
                "pack": s.get("pack", ""),
                "model": s.get("model", ""),
                "status": f.get("status", "running"),
                "tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                "llm_calls": usage.get("llm_calls", 0),
            }
        )
    return out


def _cut(text: str, limit: int = OUTPUT_LIMIT) -> str:
    text = (text or "").rstrip()
    return text if len(text) <= limit else text[:limit] + f"\n…（截断，原文 {len(text)} 字符）"


def _fence(text: str, lang: str = "") -> str:
    return f"```{lang}\n{text}\n```"


def run_to_markdown(store: TraceStore, run_id: str) -> str:
    events = store.events(run_id)
    if not events:
        raise KeyError(f"没有找到运行记录 {run_id}")
    lines: list[str] = []
    t0 = events[0].ts
    stats = {"tool_calls": 0, "tool_errors": 0, "cell_errors": 0, "rejected_findings": 0}
    errors: list[str] = []

    def at(e) -> str:
        return f"+{e.ts - t0:.1f}s"

    for e in events:
        d = e.data
        if e.type == T.RUN_STARTED:
            lines += [f"# 运行日志 {run_id}", "", f"- 问题：{d.get('question')}", f"- 领域包：{d.get('pack')}　模型：{d.get('model')}",
                      f"- 开始时间：{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(e.ts))}", ""]
        elif e.type == T.LLM_CALL:
            u = d.get("usage") or {}
            calls = ", ".join(c["name"] for c in d.get("tool_calls") or []) or "无工具调用"
            lines.append(f"<sub>{at(e)} 模型调用 [{d.get('phase')}{'·第' + str(d['step']) + '步' if d.get('step') else ''}] "
                         f"输入 {u.get('input_tokens', 0)} / 输出 {u.get('output_tokens', 0)} tokens，{d.get('duration_ms', 0) / 1000:.1f}s → {calls}</sub>")
            lines.append("")
        elif e.type == T.PLAN_PROPOSED:
            p = d["plan"]
            lines += ["## 计划", "", f"理解：{p.get('understanding', '')}", f"可回答：{p.get('answerable', True)}" + (f"（{p.get('reason')}）" if p.get("reason") else "")]
            lines += [f"{i}. **{s.get('title')}** {s.get('detail', '')}" for i, s in enumerate(p.get("steps", []), 1)]
            if p.get("assumptions"):
                lines.append("假设：" + "；".join(p["assumptions"]))
            lines += ["", "## 执行过程", ""]
        elif e.type == T.PLAN_APPROVED:
            lines += [f"> {at(e)} 用户确认计划" + ("（有修改）" if d.get("edited") else ""), ""]
        elif e.type == T.THOUGHT:
            lines += [f"💭 {d['text']}", ""]
        elif e.type == T.TOOL_CALL:
            stats["tool_calls"] += 1
            args = dict(d.get("arguments") or {})
            code = args.pop("code", None) or args.pop("sql", None)
            lines.append(f"### {at(e)} 第 {d.get('step')} 步 · `{d['name']}`")
            if args:
                lines.append(_fence(json.dumps(args, ensure_ascii=False, indent=1), "json"))
            if code:
                lines.append(_fence(code, "sql" if d["name"] == "query_sql" else "python"))
        elif e.type == T.CELL_EXECUTED:
            if d.get("error"):
                stats["cell_errors"] += 1
        elif e.type == T.RETRIEVAL:
            hits = d.get("hits") or []
            lines.append(f"检索到 {len(hits)} 段：" + "、".join(f"{h['id']}（{h['source']}）" for h in hits))
        elif e.type == T.TOOL_RESULT:
            ok = d.get("ok")
            if not ok:
                stats["tool_errors"] += 1
                if (d.get("data") or {}).get("rejected"):
                    stats["rejected_findings"] += 1
                errors.append(f"第 {d.get('step')} 步 `{d['name']}`：{_cut(d.get('text', ''), 200).splitlines()[0]}")
            lines += [f"{'✅' if ok else '❌'} 结果（{d.get('duration_ms', 0)} ms）：", _fence(_cut(d.get("text", ""))), ""]
        elif e.type == T.ASK_USER:
            lines += [f"❓ 向用户提问：{d['question']}", ""]
        elif e.type == T.CHECK:
            if d.get("ok"):
                lines += [f"🔎 报告核查第 {d['attempt']} 次：通过（{d['checked']} 个数字）", ""]
            else:
                bad = "；".join(f"{u['number']}（…{u['context']}…）" for u in d.get("unsupported", []))
                lines += [f"🔎 报告核查第 {d['attempt']} 次：未通过。无来源数字：{bad}；未知引用：{d.get('unknown_citations')}", ""]
        elif e.type == T.REPORT:
            lines += ["## 最终报告", "", d.get("markdown", ""), ""]
            if d.get("findings"):
                lines += ["## 已登记结论", ""] + [f"- **{f['id']}** {f['claim']}（证据 {f['evidence_id']}）" for f in d["findings"]] + [""]
        elif e.type == T.RUN_FINISHED:
            u = d.get("usage") or {}
            summary = [
                "## 汇总",
                "",
                f"- 状态：{d.get('status')}" + (f"，错误：{d.get('error')}" if d.get("error") else ""),
                f"- 耗时：{e.ts - t0:.0f} 秒；模型调用 {u.get('llm_calls', 0)} 次；Token 输入 {u.get('input_tokens', 0)} / 输出 {u.get('output_tokens', 0)}",
                f"- 工具调用 {stats['tool_calls']} 次，失败 {stats['tool_errors']} 次（其中代码报错 {stats['cell_errors']} 次，结论登记被拒 {stats['rejected_findings']} 次）",
            ]
            if errors:
                summary += ["", "### 失败的工具调用", ""] + [f"- {x}" for x in errors]
            lines = lines[:6] + summary + [""] + lines[6:]
    return "\n".join(lines) + "\n"
