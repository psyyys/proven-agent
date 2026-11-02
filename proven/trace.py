"""Trace store: every step an agent takes is recorded as an event.

The UI timeline is a live view of this log, the report's evidence links point into it, and it can
be exported in an OpenTelemetry-style span format for external observability tools.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Event:
    run_id: str
    session_id: str
    seq: int
    type: str
    data: dict[str, Any]
    ts: float = field(default_factory=time.time)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Event types, kept in one place so the frontend and tests agree on them.
RUN_STARTED = "run.started"
RUN_FINISHED = "run.finished"
LLM_CALL = "llm.call"
PLAN_PROPOSED = "plan.proposed"
PLAN_APPROVED = "plan.approved"
THOUGHT = "agent.thought"
TOOL_CALL = "tool.call"
TOOL_RESULT = "tool.result"
CELL_EXECUTED = "cell.executed"
RETRIEVAL = "retrieval"
FINDING = "finding.recorded"
ASK_USER = "agent.ask_user"
REPORT = "report.final"
STEP_STARTED = "step.started"  # multi mode: an analyst starts one plan step
STEP_FINISHED = "step.finished"
CHECK = "report.check"
FINDING_RETRACTED = "finding.retracted"  # replaced by a corrected finding after review
REVIEW_STARTED = "review.started"
REVIEW = "review.result"  # rule check + model review of a step's findings
LESSONS_INJECTED = "lessons.injected"  # lessons from earlier runs put into this run's prompt
REFLECTION_STARTED = "reflection.started"
REFLECTION = "reflection.result"  # failures of this run -> new or reinforced lessons; credit for used ones


class TraceStore:
    """SQLite-backed append-only event log with in-process pub/sub for live streaming."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, run_id TEXT, session_id TEXT, seq INTEGER,
                ts REAL, type TEXT, data TEXT)"""
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS ix_events_run ON events(run_id, seq)")
        self._db.commit()
        self._lock = threading.Lock()
        self._seq: dict[str, int] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    def emit(self, run_id: str, session_id: str, type: str, **data: Any) -> Event:
        with self._lock:
            seq = self._seq.get(run_id)
            if seq is None:
                row = self._db.execute("SELECT MAX(seq) FROM events WHERE run_id=?", (run_id,)).fetchone()
                seq = row[0] if row and row[0] is not None else 0
            seq += 1
            self._seq[run_id] = seq
            event = Event(run_id=run_id, session_id=session_id, seq=seq, type=type, data=data)
            self._db.execute(
                "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
                (event.id, run_id, session_id, seq, event.ts, type, json.dumps(data, ensure_ascii=False, default=str)),
            )
            self._db.commit()
        for q in self._subscribers.get(run_id, []):
            q.put_nowait(event)
        return event

    def events(self, run_id: str, after_seq: int = 0) -> list[Event]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, run_id, session_id, seq, ts, type, data FROM events WHERE run_id=? AND seq>? ORDER BY seq",
                (run_id, after_seq),
            ).fetchall()
        return [Event(id=r[0], run_id=r[1], session_id=r[2], seq=r[3], ts=r[4], type=r[5], data=json.loads(r[6])) for r in rows]

    def subscribe(self, run_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(run_id, []).append(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(run_id, [])
        if q in subs:
            subs.remove(q)

    def to_otel(self, run_id: str) -> dict[str, Any]:
        """Export a run as OpenTelemetry-style spans using the GenAI semantic convention attribute names."""
        spans = []
        for e in self.events(run_id):
            attrs: dict[str, Any] = {"proven.event.type": e.type}
            if e.type == LLM_CALL:
                attrs.update(
                    {
                        "gen_ai.operation.name": "chat",
                        "gen_ai.request.model": e.data.get("model"),
                        "gen_ai.usage.input_tokens": e.data.get("usage", {}).get("input_tokens"),
                        "gen_ai.usage.output_tokens": e.data.get("usage", {}).get("output_tokens"),
                    }
                )
            elif e.type == TOOL_CALL:
                attrs.update({"gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": e.data.get("name")})
            start = e.ts - (e.data.get("duration_ms") or 0) / 1000
            spans.append(
                {
                    "traceId": run_id,
                    "spanId": e.id,
                    "name": e.data.get("name") or e.type,
                    "startTimeUnixNano": int(start * 1e9),
                    "endTimeUnixNano": int(e.ts * 1e9),
                    "attributes": {k: v for k, v in attrs.items() if v is not None},
                }
            )
        return {"resourceSpans": [{"resource": {"attributes": {"service.name": "proven"}}, "scopeSpans": [{"spans": spans}]}]}
