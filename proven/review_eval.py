"""Trap tests for the reviewer: does it block wrong conclusions without blocking correct ones?

Each case in a pack's evals/review_cases.yaml is a claim with its evidence and the rule ids that
should fire (`expect`). `llm` marks method problems the rules cannot express; those are only
scored when the model reviewer runs too. Two numbers summarise the result:

- catch rate:          expected (case, rule) pairs that fired
- false positive rate: cases where something fired that was not expected
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .agent import prompts as P
from .agent.review import parse_model_issues
from .packs import Pack
from .rules import Evidence, Issue, RuleSet


@dataclass
class Case:
    id: str
    claim: str
    expect: list[str] = field(default_factory=list)
    evidence: str = ""
    code: str = ""
    context: str = ""
    note: str = ""


@dataclass
class CaseResult:
    id: str
    claim: str
    expect: list[str]
    fired: list[str]
    missed: list[str]
    extra: list[str]
    passed: bool
    note: str = ""
    issues: list[dict[str, Any]] = field(default_factory=list)


def cases_file(pack: Pack) -> Path:
    return pack.dir / "evals" / "review_cases.yaml"


def load_cases(pack: Pack) -> list[Case]:
    f = cases_file(pack)
    if not f.exists():
        return []
    data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    return [Case(**{**c, "expect": [str(x) for x in c.get("expect") or []]}) for c in data.get("cases") or []]


def _evidence(c: Case) -> Evidence:
    return Evidence(claim=c.claim, evidence="\n".join(x for x in (c.evidence, c.code) if x), run=c.context)


def _model_prompt(c: Case, rule_issues: list[Issue], rules: RuleSet) -> str:
    lines = [f"### [F1] {c.claim}", "证据：C1"]
    if c.code:
        lines += ["C1 代码：", "```python", c.code, "```"]
    if c.evidence:
        lines += ["C1 输出：", "```", c.evidence, "```"]
    if c.context:
        lines += ["同一次分析中的其他结论：", c.context]
    return P.REVIEW.format(
        question="（审核测试：请只判断这条结论本身）",
        task="单条结论",
        findings="\n".join(lines),
        rule_issues="\n".join(P.format_issue(i) for i in rule_issues) or "（无）",
        points="\n".join(f"{i}. {p}" for i, p in enumerate(rules.review_points, 4)),
    )


async def run_review_eval(pack: Pack, model=None, out_dir: Path | None = None, only: list[str] | None = None) -> dict[str, Any]:
    """Rules only when model is None; with a model, `llm` cases are scored on the model's issues."""
    from .agent.orchestrator import _parse_json

    rules = pack.rules()
    cases = [c for c in load_cases(pack) if not only or c.id in only]
    results: list[CaseResult] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "llm_calls": 0}
    for c in cases:
        issues = rules.check("F1", _evidence(c))
        if model is not None:
            messages = [{"role": "system", "content": P.REVIEWER_SYSTEM}, {"role": "user", "content": _model_prompt(c, issues, rules)}]
            resp = await model.chat(messages, json_mode=True)
            usage["llm_calls"] += 1
            for k in ("input_tokens", "output_tokens"):
                usage[k] += resp.usage.get(k, 0)
            issues += parse_model_issues(_parse_json(resp.content), ["F1"])
        fired = sorted({i.rule_id for i in issues if i.rule_id} | ({"llm"} if any(i.source == "llm" for i in issues) else set()))
        expect = [x for x in c.expect if model is not None or x != "llm"]
        missed = [x for x in expect if x not in fired]
        # A model warning on a case it was not expected to flag is noted but tolerated; a model error is not.
        llm_errors = any(i.source == "llm" and i.severity == "error" for i in issues)
        extra = [x for x in fired if x not in expect and (x != "llm" or llm_errors)]
        results.append(CaseResult(c.id, c.claim, c.expect, fired, missed, extra, not missed and not extra, c.note,
                                  [i.to_dict() for i in issues]))

    report = {
        "pack": pack.id,
        "mode": "full" if model is not None else "rules",
        "model": getattr(model, "model", None),
        "time": time.strftime("%Y-%m-%d %H:%M"),
        "rules": len(rules),
        "summary": summarize(results, with_model=model is not None),
        "usage": usage,
        "results": [asdict(r) for r in results],
    }
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = f"{time.strftime('%Y%m%d-%H%M%S')}-{pack.id}-{report['mode']}"
        (out_dir / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        (out_dir / f"{stem}.md").write_text(to_markdown(report), encoding="utf-8")
        report["files"] = [str(out_dir / f"{stem}.json"), str(out_dir / f"{stem}.md")]
    return report


def summarize(results: list[CaseResult], with_model: bool) -> dict[str, Any]:
    pairs = [(r, x) for r in results for x in r.expect if with_model or x != "llm"]
    caught = sum(x not in r.missed for r, x in pairs)
    clean = [r for r in results if not r.expect]
    rule_pairs = [(r, x) for r, x in pairs if x != "llm"]
    llm_pairs = [(r, x) for r, x in pairs if x == "llm"]
    return {
        "cases": len(results),
        "passed": sum(r.passed for r in results),
        "expected": len(pairs),
        "caught": caught,
        "catch_rate_pct": round(100 * caught / len(pairs), 1) if pairs else 0.0,
        "rule_caught": f"{sum(x not in r.missed for r, x in rule_pairs)}/{len(rule_pairs)}",
        "llm_caught": f"{sum(x not in r.missed for r, x in llm_pairs)}/{len(llm_pairs)}" if with_model else "未运行",
        "false_positive_cases": sum(bool(r.extra) for r in results),
        "false_positive_rate_pct": round(100 * sum(bool(r.extra) for r in results) / len(results), 1) if results else 0.0,
        "clean_cases": len(clean),
        "clean_flagged": sum(bool(r.extra) for r in clean),
        "not_covered_by_rules": sum("llm" in r.expect for r in results),
    }


def to_markdown(report: dict[str, Any]) -> str:
    s = report["summary"]
    mode = "规则 + 模型审核" if report["mode"] == "full" else "只用规则"
    lines = [
        f"# 审核测试：{report['pack']} · {mode}" + (f" · {report['model']}" if report.get("model") else ""),
        "",
        f"时间：{report['time']}　规则数：{report['rules']}　用例：{s['cases']}（正确结论 {s['clean_cases']} 条）",
        "",
        "| 指标 | 结果 |",
        "|---|---|",
        f"| 拦截率 | **{s['catch_rate_pct']}%**（{s['caught']}/{s['expected']}） |",
        f"| 规则拦截 | {s['rule_caught']} |",
        f"| 模型拦截（规则覆盖不到的问题） | {s['llm_caught']} |",
        f"| 误拦率 | **{s['false_positive_rate_pct']}%**（{s['false_positive_cases']} 条用例有多余的拦截） |",
        f"| 正确结论被误拦 | {s['clean_flagged']}/{s['clean_cases']} |",
        "",
        "| 编号 | 结论 | 应拦 | 实际 | 结果 | 说明 |",
        "|---|---|---|---|---|---|",
    ]
    for r in report["results"]:
        mark = "✓" if r["passed"] else "✗ 漏拦 " + ",".join(r["missed"]) if r["missed"] else "✗ 误拦 " + ",".join(r["extra"])
        if not r["passed"] and r["missed"] and r["extra"]:
            mark += "；误拦 " + ",".join(r["extra"])
        lines.append(f"| {r['id']} | {r['claim']} | {','.join(r['expect']) or '—'} | {','.join(r['fired']) or '—'} | {mark} | {r['note']} |")
    return "\n".join(lines) + "\n"
