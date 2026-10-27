"""HTTP API (FastAPI) with Server-Sent Events for live agent progress."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import trace as T
from ..config import Settings
from ..notebook import export_notebook
from ..service import Service

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class NewSession(BaseModel):
    pack: str = "general"


class NewRun(BaseModel):
    question: str
    auto_approve: bool = False
    mode: str | None = None  # "single" | "multi"; defaults to PROVEN_MODE


class Approval(BaseModel):
    plan: dict[str, Any] | None = None


def create_app(service: Service | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.service = service or Service(Settings.from_env())
        yield
        await app.state.service.shutdown()

    app = FastAPI(title="Proven", lifespan=lifespan)

    def svc(request: Request) -> Service:
        return request.app.state.service

    def get_session(request: Request, sid: str):
        s = svc(request).sessions.get(sid)
        if s is None:
            raise HTTPException(404, "会话不存在或已过期")
        return s

    def get_run(request: Request, rid: str):
        item = svc(request).runs.get(rid)
        if item is None:
            raise HTTPException(404, "分析不存在")
        return item

    @app.exception_handler(FileNotFoundError)
    async def _fnf(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.get("/api/health")
    async def health(request: Request):
        s = svc(request)
        st = s.settings
        return {
            "model": st.llm_model,
            "llm_configured": bool(st.llm_api_key),
            "mode": st.mode,
            "embedding": bool(s.embedder),
            "rerank": bool(s.reranker),
        }

    @app.get("/api/packs")
    async def packs(request: Request):
        return [p.to_dict() for p in svc(request).packs.values()]

    @app.post("/api/sessions")
    async def new_session(request: Request, body: NewSession):
        try:
            session = await svc(request).create_session(body.pack)
        except KeyError as e:
            raise HTTPException(404, str(e)) from e
        return session.describe()

    @app.get("/api/sessions/{sid}")
    async def session_info(request: Request, sid: str):
        return get_session(request, sid).describe()

    @app.delete("/api/sessions/{sid}")
    async def delete_session(request: Request, sid: str):
        await svc(request).close_session(sid)
        return {"ok": True}

    @app.post("/api/sessions/{sid}/datasets/{dataset_id}")
    async def load_dataset(request: Request, sid: str, dataset_id: str):
        session = get_session(request, sid)
        try:
            names = await session.load_demo(dataset_id)
        except KeyError as e:
            raise HTTPException(404, str(e)) from e
        return {"tables": names, "session": session.describe()}

    @app.post("/api/sessions/{sid}/upload")
    async def upload(request: Request, sid: str, files: list[UploadFile] = File(...)):
        session = get_session(request, sid)
        results = []
        for f in files:
            try:
                results.append(await session.add_upload(f.filename or "upload", await f.read()))
            except (ValueError, RuntimeError) as e:
                results.append({"kind": "error", "name": f.filename, "error": str(e)})
        return {"files": results, "session": session.describe()}

    @app.get("/api/sessions/{sid}/tables/{name}")
    async def table_profile(request: Request, sid: str, name: str):
        session = get_session(request, sid)
        if name not in session.profiles:
            raise HTTPException(404, "表不存在")
        return session.profiles[name]

    @app.get("/api/sessions/{sid}/chunks/{chunk_id}")
    async def chunk(request: Request, sid: str, chunk_id: str):
        c = get_session(request, sid).kb.get(chunk_id)
        if c is None:
            raise HTTPException(404, "片段不存在")
        return c.to_dict()

    @app.get("/api/sessions/{sid}/notebook")
    async def notebook(request: Request, sid: str):
        session = get_session(request, sid)
        return Response(
            export_notebook(session),
            media_type="application/x-ipynb+json",
            headers={"Content-Disposition": f'attachment; filename="proven-{sid}.ipynb"'},
        )

    @app.post("/api/sessions/{sid}/runs")
    async def new_run(request: Request, sid: str, body: NewRun):
        session = get_session(request, sid)
        if not body.question.strip():
            raise HTTPException(400, "问题不能为空")
        try:
            svc(request).model  # fail fast if the model is not configured
        except RuntimeError as e:
            raise HTTPException(400, str(e)) from e
        try:
            run = svc(request).start_run(session, body.question.strip(), body.auto_approve, body.mode)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        except RuntimeError as e:
            raise HTTPException(409, str(e)) from e
        return run.summary()

    @app.get("/api/runs/{rid}")
    async def run_info(request: Request, rid: str):
        return get_run(request, rid)[1].summary()

    @app.post("/api/runs/{rid}/approve")
    async def approve(request: Request, rid: str, body: Approval):
        _, run = get_run(request, rid)
        if run.status != "awaiting_approval":
            raise HTTPException(409, f"当前状态 {run.status}，不需要确认计划")
        svc(request).approve(rid, body.plan)
        return {"ok": True}

    @app.post("/api/runs/{rid}/cancel")
    async def cancel(request: Request, rid: str):
        get_run(request, rid)
        svc(request).cancel(rid)
        return {"ok": True}

    @app.post("/api/runs/{rid}/verify")
    async def verify(request: Request, rid: str):
        get_run(request, rid)
        try:
            exp_id = svc(request).mark_verified(rid)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return {"experience_id": exp_id}

    @app.get("/api/runs/{rid}/log.md")
    async def run_log(request: Request, rid: str):
        from ..trace_export import run_to_markdown

        try:
            text = run_to_markdown(svc(request).trace, rid)
        except KeyError as e:
            raise HTTPException(404, str(e)) from e
        return Response(text, media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="run-{rid}.md"'})

    @app.get("/api/runs/{rid}/otel")
    async def otel(request: Request, rid: str):
        get_run(request, rid)
        return svc(request).trace.to_otel(rid)

    @app.get("/api/runs/{rid}/events")
    async def events(request: Request, rid: str, after: int = 0):
        get_run(request, rid)
        store = svc(request).trace

        async def stream():
            q = store.subscribe(rid)
            try:
                last = after
                for e in store.events(rid, after_seq=after):
                    last = e.seq
                    yield _sse(e)
                    if e.type == T.RUN_FINISHED:
                        return
                while True:
                    if await request.is_disconnected():
                        return
                    try:
                        e = await asyncio.wait_for(q.get(), timeout=15)
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                        continue
                    if e.seq <= last:
                        continue
                    last = e.seq
                    yield _sse(e)
                    if e.type == T.RUN_FINISHED:
                        return
            finally:
                store.unsubscribe(rid, q)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}")
        async def spa(path: str):
            f = FRONTEND_DIST / path
            if path and f.is_file():
                return FileResponse(f)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


def _sse(e: T.Event) -> str:
    return f"id: {e.seq}\ndata: {json.dumps(e.to_dict(), ensure_ascii=False, default=str)}\n\n"
