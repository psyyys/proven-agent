"""The reflector (multi-agent phase 3): turns a run's failures into lessons for later runs.

Failures are read from the trace by code, not by the model, and each gets a signature
("code:AttributeError:…", "review:W001") so later runs can tell whether a lesson stopped it from
happening again. The model only writes the lesson text. Where a failure was later fixed in the same
run, the fix is shown too: "what went wrong and what worked" is the most useful thing to learn from.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable

from .. import trace as T
from ..findings import extract_numbers, matches
from ..lessons import normalize_message

MAX_FAILURES = 12
MAX_LESSONS = 3


@dataclass
class Failure:
    kind: str  # code | evidence | report | review | budget | tool | eval
    signature: str
    text: str
    fix: str = ""
    count: int = 1

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


KIND_LABEL = {"code": "代码报错", "evidence": "结论登记被拒", "report": "报告核查不通过", "review": "审核发现问题",
              "budget": "轮数用完", "tool": "工具调用出错", "eval": "评测答错"}


def collect_failures(events: Iterable[T.Event]) -> list[Failure]:
    out: dict[str, Failure] = {}
    open_code: Failure | None = None  # an error waiting for the cell that fixed it
    open_evidence: Failure | None = None

    def add(f: Failure) -> Failure:
        if f.signature in out:
            out[f.signature].count += 1
            return out[f.signature]
        out[f.signature] = f
        return f

    for e in events:
        d = e.data
        if e.type == T.CELL_EXECUTED:
            err = d.get("error")
            if err:
                tail = "\n".join((d.get("code") or "").strip().splitlines()[-6:])
                open_code = add(Failure("code", f"code:{err.get('name')}:{normalize_message(err.get('value') or '')}",
                                        f"{err.get('name')}: {(err.get('value') or '')[:200]}\n出错的代码（末尾）：\n{tail}"))
            elif open_code is not None and not open_code.fix:
                open_code.fix = "\n".join((d.get("code") or "").strip().splitlines()[-8:])
                open_code = None
        elif e.type == T.TOOL_RESULT and not d.get("ok"):
            name, text = d.get("name"), (d.get("text") or "")
            if name in ("run_python", "query_sql"):
                continue  # covered by the cell error
            if name == "record_finding" and (d.get("data") or {}).get("rejected"):
                open_evidence = add(Failure("evidence", "evidence:rejected", text[:300]))
            elif text.startswith("没有名为"):
                add(Failure("tool", f"tool:unknown:{name}", text[:200]))
            elif text.startswith("工具参数解析失败"):
                add(Failure("tool", "tool:arguments", text[:200]))
            else:
                add(Failure("tool", f"tool:{name}", text[:200]))
        elif e.type == T.FINDING and open_evidence is not None and not open_evidence.fix:
            open_evidence.fix = f"随后登记成功：{d.get('claim')}（证据 {d.get('evidence_id')}）"
            open_evidence = None
        elif e.type == T.CHECK and not d.get("ok") and d.get("attempt") == 1:
            ctx = "；".join(f"{u['number']}（…{u['context']}…）" for u in (d.get("unsupported") or [])[:3])
            add(Failure("report", "report:unsupported", f"报告中的数字没有对应的已登记结论：{ctx}"))
        elif e.type == T.REVIEW and d.get("round") == 1:
            for i in d.get("issues") or []:
                # rule warnings are habits worth learning (state the sample length); model warnings are too noisy
                if i.get("severity") != "error" and i.get("source") != "rule":
                    continue
                who = i.get("rule_id") or "llm"
                text = "；".join(x for x in (i.get("detail"), i.get("message"), i.get("suggestion")) if x)
                add(Failure("review", f"review:{who}", f"[{who}] {text}"[:300]))
        elif e.type == T.STEP_FINISHED and d.get("outcome") == "budget":
            add(Failure("budget", "budget", f"第 {d.get('task')} 步「{d.get('title')}」用完了轮数，没有提交总结"))
    return list(out.values())[:MAX_FAILURES]


def format_failures(failures: list[Failure]) -> str:
    lines = []
    for n, f in enumerate(failures, 1):
        head = f"[{n}] {KIND_LABEL.get(f.kind, f.kind)}" + (f"（出现 {f.count} 次）" if f.count > 1 else "")
        lines.append(f"{head}\n{f.text}")
        if f.fix:
            lines.append(f"后来成功的做法：\n{f.fix}")
    return "\n\n".join(lines)


def parse_lessons(data: dict[str, Any] | None, n_failures: int, known_ids: set[int]) -> list[dict[str, Any]]:
    out = []
    for raw in (data or {}).get("lessons") or []:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not 6 <= len(text) <= 160:
            continue
        sources = [int(i) for i in raw.get("from") or [] if str(i).isdigit() and 1 <= int(i) <= n_failures]
        reinforces = raw.get("reinforces")
        rid = int(str(reinforces).lstrip("Ll")) if reinforces and str(reinforces).lstrip("Ll").isdigit() else None
        out.append({
            "text": text,
            "when": str(raw.get("when") or "").strip()[:60],
            "scope": raw.get("scope") if raw.get("scope") in ("pack", "all") else "pack",
            "from": sources,
            "reinforces": rid if rid in known_ids else None,
        })
    return out[:MAX_LESSONS]


def leaks_result(text: str, results: list[float]) -> bool:
    """A lesson must be a way of working, not this run's answer: reject it if it repeats a result number."""
    return any(matches(n, v) for n in extract_numbers(text) for v in results if abs(v) >= 10)
