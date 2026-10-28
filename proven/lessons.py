"""Lesson store (multi-agent phase 3): short, actionable lessons distilled from failed steps.

A lesson is written by the reflector after a run that had failures ("plotly 设置标题用
fig.update_layout()，没有 add_layout"), or by hand. Later runs get the most relevant lessons in
their prompt. Each lesson remembers which failures it came from (signatures); when it was in the
prompt and the same failure happened again, it did not help, and after enough such runs it is retired.

This is verbal reinforcement in the sense of Reflexion (Shinn et al., 2023): no model weights change.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .rag.index import tokenize

RETIRE_AFTER_USES = 3
RETIRE_BELOW = 0.3
SIMILAR = 0.6  # token Dice above which a new lesson is treated as a repeat of an existing one

_COLUMNS = ("id", "pack", "scope", "text", "when_", "category", "signatures", "source_runs", "origin", "status", "pinned",
            "hits", "uses", "helped", "failed_after", "created", "updated")


@dataclass
class Lesson:
    id: int
    pack: str
    scope: str  # "pack": only this pack | "all": environment, libraries, tool usage
    text: str
    when: str  # when it applies, e.g. "用 plotly 画图时"
    category: str  # kind of failure it came from: code | evidence | report | review | budget | tool | eval | manual
    signatures: list[str] = field(default_factory=list)
    source_runs: list[str] = field(default_factory=list)
    origin: str = "auto"  # auto | manual
    status: str = "active"  # active | retired
    pinned: bool = False  # pinned lessons are never retired
    hits: int = 1  # times the reflector produced it (again)
    uses: int = 0  # runs that had it in the prompt
    helped: int = 0  # ...and did not repeat its failure
    failed_after: int = 0  # ...and repeated it anyway
    created: float = 0.0
    updated: float = 0.0

    @property
    def label(self) -> str:
        return f"L{self.id}"

    @property
    def score(self) -> float:
        """Laplace-smoothed share of uses after which the failure did not recur; 0.5 when unused."""
        return (self.helped + 1) / (self.helped + self.failed_after + 2)

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "label": self.label, "score": round(self.score, 2)}


def _dice(a: str, b: str) -> float:
    x, y = set(tokenize(a)), set(tokenize(b))
    return 2 * len(x & y) / (len(x) + len(y)) if x and y else 0.0


def signature_matches(a: str, b: str) -> bool:
    """'code:KeyError:...' matches another KeyError with a similar message; 'review:W001' matches exactly."""
    pa, pb = a.split(":", 2), b.split(":", 2)
    if pa[:2] != pb[:2]:
        return False
    if len(pa) < 3 or len(pb) < 3 or not pa[2] or not pb[2]:
        return True
    return _dice(pa[2], pb[2]) >= 0.4 or pa[2] == pb[2]


class LessonStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY, pack TEXT, scope TEXT, text TEXT, when_ TEXT, category TEXT,
                signatures TEXT, source_runs TEXT, origin TEXT, status TEXT, pinned INTEGER,
                hits INTEGER, uses INTEGER, helped INTEGER, failed_after INTEGER, created REAL, updated REAL)"""
        )
        self._db.commit()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ CRUD

    def add(self, pack: str, text: str, when: str = "", scope: str = "pack", category: str = "manual",
            signatures: list[str] | None = None, run_id: str | None = None, origin: str = "auto") -> Lesson:
        now = time.time()
        with self._lock:
            cur = self._db.execute(
                f"INSERT INTO lessons ({', '.join(_COLUMNS[1:])}) VALUES ({', '.join('?' * (len(_COLUMNS) - 1))})",
                (pack, scope, text, when, category, json.dumps(signatures or [], ensure_ascii=False),
                 json.dumps([run_id] if run_id else []), origin, "active", int(origin == "manual"), 1, 0, 0, 0, now, now),
            )
            self._db.commit()
            lid = cur.lastrowid
        return self.get(lid)

    def get(self, lesson_id: int) -> Lesson | None:
        with self._lock:
            row = self._db.execute(f"SELECT {', '.join(_COLUMNS)} FROM lessons WHERE id=?", (lesson_id,)).fetchone()
        return _row(row) if row else None

    def all(self, pack: str | None = None, status: str | None = None) -> list[Lesson]:
        """A pack's lessons plus the lessons that apply everywhere (scope "all")."""
        sql, args = f"SELECT {', '.join(_COLUMNS)} FROM lessons WHERE 1=1", []
        if pack:
            sql += " AND (pack=? OR scope='all')"
            args.append(pack)
        if status:
            sql += " AND status=?"
            args.append(status)
        with self._lock:
            rows = self._db.execute(sql + " ORDER BY id", args).fetchall()
        return [_row(r) for r in rows]

    def update(self, lesson_id: int, **fields: Any) -> Lesson | None:
        allowed = {"text": "text", "when": "when_", "scope": "scope", "status": "status", "pinned": "pinned"}
        sets = {allowed[k]: (int(v) if k == "pinned" else v) for k, v in fields.items() if k in allowed and v is not None}
        if sets:
            with self._lock:
                self._db.execute(
                    f"UPDATE lessons SET {', '.join(f'{c}=?' for c in sets)}, updated=? WHERE id=?",
                    (*sets.values(), time.time(), lesson_id),
                )
                self._db.commit()
        return self.get(lesson_id)

    def delete(self, lesson_id: int) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM lessons WHERE id=?", (lesson_id,))
            self._db.commit()
            return cur.rowcount > 0

    # ------------------------------------------------------------------ learning

    def similar(self, pack: str, text: str) -> Lesson | None:
        best = max(((_dice(text, x.text), x) for x in self.all(pack)), default=(0.0, None), key=lambda t: t[0])
        return best[1] if best[0] >= SIMILAR else None

    def reinforce(self, lesson_id: int, run_id: str | None, signatures: list[str]) -> Lesson | None:
        """The reflector found the same lesson again: count it and merge its sources. A retired lesson stays
        retired: its failure keeps happening although the lesson was in the prompt, so repeating the same
        words will not help; the reflector is asked for a different lesson instead."""
        x = self.get(lesson_id)
        if x is None:
            return None
        sigs = x.signatures + [s for s in signatures if not any(signature_matches(s, t) for t in x.signatures)]
        runs = x.source_runs + ([run_id] if run_id and run_id not in x.source_runs else [])
        with self._lock:
            self._db.execute(
                "UPDATE lessons SET hits=hits+1, signatures=?, source_runs=?, updated=? WHERE id=?",
                (json.dumps(sigs, ensure_ascii=False), json.dumps(runs[-20:]), time.time(), lesson_id),
            )
            self._db.commit()
        return self.get(lesson_id)

    def select(self, pack: str, question: str, k: int = 5) -> list[Lesson]:
        """Lessons for a new run: relevant to the question, weighted by how well they have worked.
        Lessons about the environment and tools (scope "all") apply to any question."""
        ranked = []
        for x in self.all(pack, status="active"):
            relevance = _dice(question, f"{x.when} {x.text}")
            if x.scope == "all":
                relevance = max(relevance, 0.3)
            elif relevance < 0.05:
                continue
            ranked.append((relevance + 0.5 * x.score + 0.05 * min(x.hits, 5), x))
        ranked.sort(key=lambda t: -t[0])
        return [x for _, x in ranked[:k]]

    def credit(self, lesson_ids: list[int], failure_signatures: list[str]) -> dict[int, str]:
        """After a run that had these lessons in its prompt: did their failures happen again?
        Returns {id: "helped" | "failed" | "retired"}. Weak evidence by design: a failure that did not
        recur may simply not have come up, so a lesson is only retired after several failed uses."""
        out: dict[int, str] = {}
        for lid in lesson_ids:
            x = self.get(lid)
            if x is None or not x.signatures:  # a lesson not tied to any failure cannot be credited
                continue
            repeated = any(signature_matches(s, t) for s in failure_signatures for t in x.signatures)
            col = "failed_after" if repeated else "helped"
            with self._lock:
                self._db.execute(f"UPDATE lessons SET uses=uses+1, {col}={col}+1, updated=? WHERE id=?", (time.time(), lid))
                self._db.commit()
            x = self.get(lid)
            out[lid] = "failed" if repeated else "helped"
            if not x.pinned and x.uses >= RETIRE_AFTER_USES and x.score < RETIRE_BELOW:
                self.update(lid, status="retired")
                out[lid] = "retired"
        return out


def _row(r) -> Lesson:
    d = dict(zip(_COLUMNS, r))
    d["when"] = d.pop("when_")
    d["signatures"] = json.loads(d["signatures"] or "[]")
    d["source_runs"] = json.loads(d["source_runs"] or "[]")
    d["pinned"] = bool(d["pinned"])
    return Lesson(**d)


def normalize_message(text: str) -> str:
    """Error messages without the parts that change between runs (numbers, quoted names, paths)."""
    text = re.sub(r"(['\"]).*?\1", "'…'", text)
    return re.sub(r"\d+", "#", text).strip()[:80]
