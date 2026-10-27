"""Experience store: verified question -> code pairs, recalled as references for similar questions."""

from __future__ import annotations

import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .rag.index import tokenize


@dataclass
class Experience:
    id: int
    pack: str
    question: str
    code: str
    created: float

    def to_dict(self) -> dict:
        return {"id": self.id, "pack": self.pack, "question": self.question, "code": self.code, "created": self.created}


class ExperienceStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS experiences (id INTEGER PRIMARY KEY, pack TEXT, question TEXT, code TEXT, created REAL)"
        )
        self._db.commit()
        self._lock = threading.Lock()

    def add(self, pack: str, question: str, code: str) -> Experience:
        with self._lock:
            ts = time.time()
            cur = self._db.execute(
                "INSERT INTO experiences (pack, question, code, created) VALUES (?,?,?,?)", (pack, question, code, ts)
            )
            self._db.commit()
            return Experience(cur.lastrowid, pack, question, code, ts)

    def all(self, pack: str) -> list[Experience]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, pack, question, code, created FROM experiences WHERE pack=? ORDER BY id", (pack,)
            ).fetchall()
        return [Experience(*r) for r in rows]

    def recall(self, pack: str, question: str, top_k: int = 2, min_overlap: float = 0.5) -> list[Experience]:
        """Rank by token overlap (Dice coefficient). The store is small, so a simple, predictable score
        works better than BM25, whose IDF degenerates on a handful of documents."""
        q = set(tokenize(question))
        if not q:
            return []
        scored = []
        for e in self.all(pack):
            d = set(tokenize(e.question))
            score = 2 * len(q & d) / (len(q) + len(d)) if d else 0.0
            if score >= min_overlap:
                scored.append((score, e))
        scored.sort(key=lambda x: -x[0])
        return [e for _, e in scored[:top_k]]
