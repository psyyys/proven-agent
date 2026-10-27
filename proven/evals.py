"""Evaluation harness: run a pack's test questions through the agent and score the results.

Reference answers are computed by each question's answer_code in a separate kernel, so the agent never
sees them. Scoring is programmatic:
- numeric questions pass when every reference number matches a number in the agent's recorded findings
- trap questions pass when the agent records no numeric finding and says it cannot answer
- rag questions pass when at least one finding cites a knowledge-base chunk
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .packs import Pack
from .service import Service

REFUSAL_WORDS = ("无法", "不能", "没有", "缺少", "不包含", "未包含", "不足以")


@dataclass
class Question:
    id: str
    type: str
    question: str
    dataset: str | None = None
    answer_code: str | None = None
    expect: str | None = None  # "refuse" | "doc"
    tol: float = 0.005


@dataclass
class Result:
    id: str
    type: str
    question: str
    passed: bool
    expected: Any = None
    got: list[float] = field(default_factory=list)
    status: str = ""
    note: str = ""
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    run_id: str = ""


def load_questions(pack: Pack) -> list[Question]:
    data = yaml.safe_load(pack.evals_file.read_text(encoding="utf-8"))
    default_ds = data.get("dataset")
    return [Question(**{"dataset": default_ds, **q}) for q in data["questions"]]


def _as_list(v: Any) -> list[float]:
    return [float(x) for x in (v if isinstance(v, (list, tuple)) else [v])]


def _close(got: float, expected: float, tol: float) -> bool:
    """Equal within tolerance, also accepting a percent written as a fraction (or vice versa) and a
    decline written without its sign ("下降 5.64%" for -5.64)."""
    targets = {expected, -expected} if expected < 0 else {expected}
    for g in (got, got * 100, got / 100):
        for e in targets:
            if abs(g - e) <= max(tol * abs(e), 1e-6):
                return True
    return False


async def compute_references(service: Service, pack: Pack, questions: list[Question]) -> dict[str, list[float]]:
    refs: dict[str, list[float]] = {}
    by_ds: dict[str | None, list[Question]] = {}
    for q in questions:
        if q.answer_code:
            by_ds.setdefault(q.dataset, []).append(q)
    for ds, qs in by_ds.items():
        session = await service.create_session(pack.id)
        try:
            if ds:
                await session.load_demo(ds)
            for q in qs:
                code = q.answer_code + "\nimport json as _j\nprint(_j.dumps(answer, default=float))"
                r = await session.executor.run(code, record=False)
                if not r.ok:
                    raise RuntimeError(f"reference code for {q.id} failed: {r.error['name']}: {r.error['value']}")
                refs[q.id] = _as_list(json.loads(r.stdout.strip().splitlines()[-1]))
        finally:
            await service.close_session(session.id)
    return refs


def score(q: Question, run, expected: list[float] | None) -> tuple[bool, list[float], str]:
    got: list[float] = []
    for f in run.findings.items:
        got += f.numbers
        if f.value is not None:
            got.append(f.value)
    if q.expect == "refuse":
        numeric = [f for f in run.findings.items if f.numbers]
        said_no = (run.plan or {}).get("answerable") is False or any(w in run.report for w in REFUSAL_WORDS)
        return (not numeric and said_no), got, "" if said_no else "没有明确拒答"
    if q.expect == "doc":
        ok = any(f.evidence_type in ("doc", "mixed") for f in run.findings.items)
        return ok, got, "" if ok else "没有引用知识库片段"
    missing = [e for e in expected or [] if not any(_close(g, e, q.tol) for g in got)]
    return not missing, got, f"未找到 {missing}" if missing else ""


async def run_eval(service: Service, pack_id: str, only: list[str] | None = None, out_dir: Path | None = None,
                   mode: str | None = None) -> dict[str, Any]:
    pack = service.packs[pack_id]
    questions = [q for q in load_questions(pack) if not only or q.id in only]
    refs = await compute_references(service, pack, questions)
    results: list[Result] = []
    for q in questions:
        session = await service.create_session(pack.id)
        started = time.monotonic()
        try:
            if q.dataset:
                await session.load_demo(q.dataset)
            run = service.start_run(session, q.question, auto_approve=True, mode=mode)
            await service.wait(run.id)
            passed, got, note = score(q, run, refs.get(q.id))
            results.append(
                Result(
                    id=q.id, type=q.type, question=q.question, passed=passed and run.status == "done",
                    expected=refs.get(q.id) or q.expect, got=got, status=run.status,
                    note=note or ("" if run.status == "done" else f"状态 {run.status}"),
                    llm_calls=run.usage["llm_calls"], input_tokens=run.usage["input_tokens"],
                    output_tokens=run.usage["output_tokens"], seconds=round(time.monotonic() - started, 1), run_id=run.id,
                )
            )
        finally:
            await service.close_session(session.id)
        r = results[-1]
        print(f"  {'✓' if r.passed else '✗'} {r.id} [{r.type}] {r.question[:40]}  {r.note}")

    summary = _summarize(results)
    mode = mode or service.settings.mode
    report = {"pack": pack_id, "model": service.model.model, "mode": mode, "time": time.strftime("%Y-%m-%d %H:%M"), "summary": summary,
              "results": [asdict(r) for r in results]}
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = f"{time.strftime('%Y%m%d-%H%M%S')}-{pack_id}-{mode}-{service.model.model.replace('/', '_')}"
        (out_dir / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        (out_dir / f"{stem}.md").write_text(to_markdown(report), encoding="utf-8")
        report["files"] = [str(out_dir / f"{stem}.json"), str(out_dir / f"{stem}.md")]
    return report


def _summarize(results: list[Result]) -> dict[str, Any]:
    by_type: dict[str, list[Result]] = {}
    for r in results:
        by_type.setdefault(r.type, []).append(r)
    n = len(results) or 1
    return {
        "total": len(results),
        "passed": sum(r.passed for r in results),
        "accuracy_pct": round(100 * sum(r.passed for r in results) / n, 1),
        "by_type": {t: f"{sum(r.passed for r in rs)}/{len(rs)}" for t, rs in by_type.items()},
        "avg_llm_calls": round(sum(r.llm_calls for r in results) / n, 1),
        "total_tokens": sum(r.input_tokens + r.output_tokens for r in results),
        "avg_seconds": round(sum(r.seconds for r in results) / n, 1),
    }


def to_markdown(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        f"# 评测报告：{report['pack']} · {report['model']} · {report.get('mode', 'single')} 模式",
        "",
        f"时间：{report['time']}　正确率：**{s['accuracy_pct']}%**（{s['passed']}/{s['total']}）　"
        f"平均模型调用：{s['avg_llm_calls']} 次　总 Token：{s['total_tokens']}　平均耗时：{s['avg_seconds']} 秒",
        "",
        "| 题型 | 通过 |",
        "|---|---|",
        *[f"| {t} | {v} |" for t, v in s["by_type"].items()],
        "",
        "| 编号 | 题型 | 问题 | 结果 | 标准答案 | 备注 |",
        "|---|---|---|---|---|---|",
    ]
    for r in report["results"]:
        lines.append(f"| {r['id']} | {r['type']} | {r['question']} | {'✓' if r['passed'] else '✗'} | {r['expected']} | {r['note']} |")
    return "\n".join(lines) + "\n"
