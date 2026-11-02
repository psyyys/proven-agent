"""The reviewer (multi-agent phase 2): checks recorded findings before they reach the report.

Two layers:
1. Rule check: the pack's rules.yaml, applied by code (proven/rules.py). Deterministic and free.
2. Model review: a reviewer role with a fresh context sees only the findings, their code and
   output, and the rule issues, and looks for method problems the rules cannot express.

The orchestrator decides what happens next: an error sends the work back to the analyst once,
warnings go to the report's limitations section.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..findings import Finding
from ..rules import Evidence, Issue, RuleSet
from . import prompts as P

CODE_LIMIT = 1200
OUTPUT_LIMIT = 1500
MAX_MODEL_ISSUES = 8


@dataclass
class ReviewResult:
    issues: list[Issue] = field(default_factory=list)
    model_used: bool = False

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]


def evidence_text(session, finding: Finding) -> str:
    parts = []
    for eid in finding.evidence_id.split(","):
        if eid.startswith("C") and eid in session.cells:
            cell = session.cells[eid]
            parts.append(cell.plain_text() + "\n" + cell.code)
        elif eid.startswith("D"):
            chunk = session.kb.get(eid)
            if chunk is not None:
                parts.append(chunk.text)
    return "\n".join(parts)


def rule_check(rules: RuleSet, session, run, finding_ids: list[str]) -> list[Issue]:
    issues: list[Issue] = []
    active = run.findings.active()
    for fid in finding_ids:
        f = run.findings.get(fid)
        if f is None or f.status != "active":
            continue
        others = "\n".join(x.claim for x in active if x.id != fid)
        issues += rules.check(fid, Evidence(claim=f.claim, evidence=evidence_text(session, f), run=others))
    return issues


def model_prompt(session, run, finding_ids: list[str], task: str, rule_issues: list[Issue], rules: RuleSet) -> str:
    blocks, shown = [], set()
    for fid in finding_ids:
        f = run.findings.get(fid)
        if f is None or f.status != "active":
            continue
        lines = [f"### [{f.id}] {f.claim}", f"证据：{f.evidence_id}"]
        for eid in f.evidence_id.split(","):
            if eid in shown:
                lines.append(f"（{eid} 的代码和输出见上文）")
                continue
            shown.add(eid)
            if eid.startswith("C") and eid in session.cells:
                cell = session.cells[eid]
                lines += [f"{eid} 代码：", "```python", _cut(cell.code, CODE_LIMIT), "```", f"{eid} 输出：", "```",
                          _cut(cell.plain_text(), OUTPUT_LIMIT), "```"]
            elif eid.startswith("D") and session.kb.get(eid) is not None:
                lines += [f"{eid} 文档原文：", _cut(session.kb.get(eid).text, OUTPUT_LIMIT)]
        blocks.append("\n".join(lines))
    points = "\n".join(f"{i}. {p}" for i, p in enumerate(rules.review_points, 4))
    return P.REVIEW.format(
        question=run.question,
        task=task,
        findings="\n\n".join(blocks),
        rule_issues="\n".join(P.format_issue(i) for i in rule_issues) or "（无）",
        points=points,
    )


def parse_model_issues(data: dict[str, Any] | None, finding_ids: list[str]) -> list[Issue]:
    """Issues from the reviewer's JSON; anything malformed or about other findings is dropped."""
    out = []
    for raw in (data or {}).get("issues") or []:
        if not isinstance(raw, dict):
            continue
        fid = str(raw.get("finding") or "").strip().upper()
        problem = str(raw.get("problem") or "").strip()
        if fid not in finding_ids or not problem:
            continue
        severity = raw.get("severity") if raw.get("severity") in ("error", "warning") else "warning"
        out.append(Issue(finding_id=fid, severity=severity, message=problem, suggestion=str(raw.get("suggestion") or "").strip(),
                         source="llm", name="审核员意见"))
    return out[:MAX_MODEL_ISSUES]


def _cut(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit] + f"\n…（截断，共 {len(text)} 字符）"
