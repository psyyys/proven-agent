"""Application service: owns sessions and runs. Used by the HTTP API, the CLI and the eval harness."""

from __future__ import annotations

import asyncio
from typing import Callable

from .agent import Orchestrator, Run, Session
from .config import Settings
from .experience import ExperienceStore
from .llm import ChatModel, build_chat_model, build_embedder
from .packs import Pack, discover_packs
from .rag import KnowledgeBase, Reranker
from .sandbox import Executor
from .trace import TraceStore


class Service:
    def __init__(
        self,
        settings: Settings,
        model_factory: Callable[[], ChatModel] | None = None,
        executor_factory: Callable[[Session], Executor] | None = None,
        embedder=None,
        use_default_embedder: bool = True,
    ):
        self.settings = settings
        settings.workspace.mkdir(parents=True, exist_ok=True)
        self.trace = TraceStore(settings.workspace / "trace.db")
        self.experience = ExperienceStore(settings.workspace / "experience.db")
        self.packs: dict[str, Pack] = discover_packs()
        self._model_factory = model_factory or (lambda: build_chat_model(settings))
        self._model: ChatModel | None = None
        self.embedder = embedder if embedder is not None else (build_embedder(settings) if use_default_embedder else None)
        key = settings.embed_api_key or settings.llm_api_key
        self.reranker = Reranker(settings.rerank_model, key) if settings.rerank_model and key else None
        self.sessions: dict[str, Session] = {}
        self.runs: dict[str, tuple[Session, Run]] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    @property
    def model(self) -> ChatModel:
        if self._model is None:
            self._model = self._model_factory()
        return self._model

    @property
    def orchestrator(self) -> Orchestrator:
        return Orchestrator(self.model, self.settings)

    async def create_session(self, pack_id: str = "general", executor: Executor | None = None) -> Session:
        pack = self.packs.get(pack_id)
        if pack is None:
            raise KeyError(f"unknown pack: {pack_id}")
        kb = KnowledgeBase(self.settings.workspace / "embed_cache", self.embedder, self.reranker)
        session = Session(pack, self.settings, self.trace, self.experience, kb, executor=executor)
        await session.start()
        self.sessions[session.id] = session
        return session

    def start_run(self, session: Session, question: str, auto_approve: bool = True) -> Run:
        if any(r.status in ("planning", "awaiting_approval", "running", "reporting") for r in session.runs.values()):
            raise RuntimeError("该会话中有分析正在进行，请等待完成或取消后再提问")
        run = Run(question=question, auto_approve=auto_approve)
        session.runs[run.id] = run
        self.runs[run.id] = (session, run)
        self._tasks[run.id] = asyncio.create_task(self.orchestrator.run(session, run))
        return run

    async def wait(self, run_id: str) -> Run:
        await self._tasks[run_id]
        return self.runs[run_id][1]

    def approve(self, run_id: str, plan: dict | None = None) -> None:
        _, run = self.runs[run_id]
        Orchestrator.approve(run, plan)

    def cancel(self, run_id: str) -> None:
        _, run = self.runs[run_id]
        Orchestrator.cancel(run)

    def mark_verified(self, run_id: str) -> int:
        """Save the run's successful code as an experience for future similar questions."""
        session, run = self.runs[run_id]
        code = "\n\n".join(session.cells[c].code for c in run.cell_ids if session.cells[c].ok)
        if not code:
            raise ValueError("这次分析没有成功运行的代码")
        return self.experience.add(session.pack.id, run.question, code).id

    async def close_session(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session:
            for run_id in list(session.runs):
                task = self._tasks.pop(run_id, None)
                if task and not task.done():
                    task.cancel()
            await session.close()

    async def shutdown(self) -> None:
        for sid in list(self.sessions):
            await self.close_session(sid)
