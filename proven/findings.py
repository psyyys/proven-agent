"""Findings and the anti-hallucination check.

Two programmatic guarantees, neither of which relies on the model behaving:

1. Evidence check: when the agent records a finding, every number in its claim must actually appear
   in the output of the code cell (or the document chunk) it cites.
2. Report check: every number in the final report must be backed by some recorded finding.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

# A number, optionally with thousands separators, decimals, exponent, and a trailing % / 万 / 亿.
_NUM = re.compile(
    r"(?<![0-9A-Za-z_.])(?P<sign>[-−])?(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:[eE](?P<exp>[-+]?\d+))?"
    r"\s*(?P<unit>%|％|万|亿|个百分点)?"
)
_CITATION = re.compile(r"\[(?:F|C|D)\d+(?:\s*[,，]\s*(?:F|C|D)\d+)*\]")
_DATE_PATTERNS = [
    re.compile(r"(?<![0-9])(?:19|20)\d{2}[-/]\d{1,2}(?:[-/]\d{1,2})?(?![0-9])"),  # 2023-01-05, 2023/1
    re.compile(r"(?<![0-9])(?:19|20)\d{2}\.\d{1,2}\.\d{1,2}(?![0-9])"),  # 2023.01.05
    re.compile(r"\d{4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?)?"),  # 2023年 / 2023年3月5日
    re.compile(r"\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?"),  # 3月 / 3月5日
    re.compile(r"(?<![0-9A-Za-z])[Qq][1-4](?![0-9])"),
    re.compile(r"(?<![0-9.,])(?:19|20)\d{2}(?![0-9.,]|\s*(?:%|％|万|亿))"),  # bare years
    re.compile(r"\d{1,2}:\d{2}(?::\d{2})?"),  # times
]
_DECLINE = re.compile(r"下降|减少|降低|下跌|下滑|回落|减|降|跌|少")
_LIST_MARKER = re.compile(r"^\s*(?:\d+[.)、]|#+)\s", re.M)


@dataclass
class Number:
    value: float  # normalized value (percent kept as written, e.g. 23.4 for "23.4%")
    raw: str
    unit: str | None
    decimals: int
    start: int
    end: int


@dataclass
class Finding:
    id: str
    claim: str
    evidence_type: str  # "cell" | "doc"
    evidence_id: str  # cell id (C3) or chunk id (D12)
    value: float | None = None
    numbers: list[float] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _masked_spans(text: str) -> list[tuple[int, int]]:
    spans = [m.span() for m in _CITATION.finditer(text)]
    for pat in _DATE_PATTERNS:
        spans += [m.span() for m in pat.finditer(text)]
    spans += [m.span() for m in _LIST_MARKER.finditer(text)]
    return spans


def extract_numbers(text: str, skip_trivial: bool = True) -> list[Number]:
    """Pull the numbers out of prose, skipping citations, dates, list markers and small ordinals."""
    masked = _masked_spans(text)
    out: list[Number] = []
    for m in _NUM.finditer(text):
        s, e = m.span("num")
        if any(a <= s < b for a, b in masked):
            continue
        raw = m.group("num")
        value = float(raw.replace(",", ""))
        if m.group("exp"):
            value *= 10 ** int(m.group("exp"))
        if m.group("sign"):
            value = -value
        unit = m.group("unit")
        if unit == "万":
            value *= 1e4
        elif unit == "亿":
            value *= 1e8
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        # Small whole numbers ("前 5 名", "3 个步骤") carry little hallucination risk and are mostly ordinals.
        if skip_trivial and decimals == 0 and unit is None and abs(value) <= 10:
            continue
        out.append(Number(value=value, raw=m.group(0).strip(), unit=unit, decimals=decimals, start=s, end=m.end()))
    return out


def _candidates(n: Number) -> list[float]:
    """Values a written number could stand for: 23.4% may be printed as 23.4 or 0.234."""
    vals = [n.value]
    if n.unit in ("%", "％", "个百分点"):
        vals.append(n.value / 100)
    return vals


def matches(written: Number, actual: float) -> bool:
    """Does a number written in prose agree with a computed value, allowing for rounding?"""
    if math.isnan(actual):
        return False
    for cand in _candidates(written):
        tol = 0.5 * 10 ** (-written.decimals)
        if cand != written.value:  # percent converted to a fraction: scale the rounding tolerance too
            tol /= 100
        # Large numbers written with 万/亿 are rounded at the unit's scale.
        if written.unit == "万":
            tol *= 1e4
        elif written.unit == "亿":
            tol *= 1e8
        if abs(cand - actual) <= tol + 1e-9 * max(1.0, abs(actual)):
            return True
        if actual != 0 and abs(cand - actual) / abs(actual) <= 1e-6:
            return True
    return False


def numbers_in_evidence(text: str) -> list[float]:
    # Evidence text is raw program output: keep every number, including small ones and dates' parts.
    vals = []
    for m in _NUM.finditer(text):
        raw = m.group("num")
        v = float(raw.replace(",", ""))
        if m.group("exp"):
            v *= 10 ** int(m.group("exp"))
        if m.group("sign"):
            v = -v
        vals.append(v)
    return vals


def unsupported_numbers(claim: str, evidence_text: str) -> list[str]:
    """Numbers in a claim that do not appear in the evidence output."""
    evidence = numbers_in_evidence(evidence_text)
    negatives = [-v for v in evidence if v < 0]
    missing = []
    # Small whole numbers ("前 5 名") are skipped, consistent with the report check.
    for n in extract_numbers(claim):
        if any(matches(n, v) for v in evidence):
            continue
        # "下降 5.64%" for a computed -5.64: accepted only when the claim states the direction,
        # so "增长 5.64%" for a real decline is still rejected.
        if _DECLINE.search(claim[max(0, n.start - 8) : n.start]) and any(matches(n, v) for v in negatives):
            continue
        missing.append(n.raw)
    return missing


class FindingRegistry:
    def __init__(self) -> None:
        self.items: list[Finding] = []

    def add(self, claim: str, evidence_type: str, evidence_id: str, value: float | None) -> Finding:
        nums = [n.value for n in extract_numbers(claim, skip_trivial=False)]
        f = Finding(
            id=f"F{len(self.items) + 1}",
            claim=claim,
            evidence_type=evidence_type,
            evidence_id=evidence_id,
            value=value,
            numbers=nums,
        )
        self.items.append(f)
        return f

    def get(self, fid: str) -> Finding | None:
        return next((f for f in self.items if f.id == fid), None)

    def supported_values(self) -> list[float]:
        vals: list[float] = []
        for f in self.items:
            vals.extend(f.numbers)
            if f.value is not None:
                vals.append(f.value)
        return vals


@dataclass
class ReportCheck:
    checked: int
    unsupported: list[dict[str, Any]]
    unknown_citations: list[str]

    @property
    def ok(self) -> bool:
        return not self.unsupported and not self.unknown_citations

    def to_dict(self) -> dict[str, Any]:
        return {"checked": self.checked, "unsupported": self.unsupported, "unknown_citations": self.unknown_citations, "ok": self.ok}


def check_report(report: str, registry: FindingRegistry, extra_allowed: Iterable[str] = ()) -> ReportCheck:
    """Every number in the report must match a recorded finding; every [F#] citation must exist.

    extra_allowed: texts whose numbers are allowed without a finding (e.g. the user's own question).
    """
    supported = registry.supported_values()
    for t in extra_allowed:
        supported += [n.value for n in extract_numbers(t, skip_trivial=False)]

    nums = extract_numbers(report)
    bad = []
    for n in nums:
        if not any(matches(n, v) for v in supported):
            ctx = report[max(0, n.start - 20) : n.end + 10].replace("\n", " ")
            bad.append({"number": n.raw, "context": ctx, "start": n.start, "end": n.end})

    known = {f.id for f in registry.items}
    cited = set(re.findall(r"F\d+", " ".join(_CITATION.findall(report))))
    unknown = sorted(c for c in cited if c not in known)
    return ReportCheck(checked=len(nums), unsupported=bad, unknown_citations=unknown)
