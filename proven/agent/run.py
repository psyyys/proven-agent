"""Per-run state and the context object handed to tools."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

from .. import trace as T
from ..config import Settings
from ..findings import FindingRegistry
from ..sandbox import CellResult
from .session import Session


@dataclass
class Run:
    question: str
    auto_approve: bool = True
    mode: str | None = None  # overrides Settings.mode for this run
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:10])
    status: str = "pending"  # pending | planning | awaiting_approval | running | reporting | done | needs_input | cancelled | error
    plan: dict[str, Any] | None = None
    findings: FindingRegistry = field(default_factory=FindingRegistry)
    cell_ids: list[str] = field(default_factory=list)
    report: str = ""
    pending_question: str = ""  # set when the agent paused to ask the user something
    check: dict[str, Any] | None = None
    usage: dict[str, int] = field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0, "llm_calls": 0})
    _approval: asyncio.Future | None = None
    cancelled: bool = False

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "question": self.question,
            "status": self.status,
            "plan": self.plan,
            "findings": [f.to_dict() for f in self.findings.items],
            "cells": self.cell_ids,
            "report": self.report,
            "check": self.check,
            "usage": self.usage,
            "mode": self.mode,
        }


class RunContext:
    def __init__(self, session: Session, run: Run, settings: Settings):
        self.session = session
        self.run = run
        self.settings = settings
        # In multi mode, the plan step (1-based) the current analyst works on; tags every event.
        self.task: int | None = None
        self.step_findings: list[str] | None = None  # finding ids recorded by the current analyst

    def emit(self, type: str, **data: Any) -> T.Event:
        if self.task is not None:
            data.setdefault("task", self.task)
        return self.session.trace.emit(self.run.id, self.session.id, type, **data)

    async def execute(self, code: str, purpose: str = "") -> CellResult:
        cell = await self.session.executor.run(code)
        self.session.cells[cell.cell_id] = cell
        self.run.cell_ids.append(cell.cell_id)
        self.emit(T.CELL_EXECUTED, purpose=purpose, **cell.to_dict())
        return cell
