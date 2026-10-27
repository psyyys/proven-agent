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


class SettingsPatch(BaseModel):
    mode: str | None = None
    step_budget: int | None = None
    max_steps: int | None = None
    llm_temperature: float | None = None
    tool_output_chars: int | None = None
    cell_timeout: int | None = None


class KnowledgeQuery(BaseModel):
    query: str
    top_k: int = 5


# Runtime-adjustable settings and their allowed ranges. Changes last until the server restarts.
SETTING_LIMITS = {
    "step_budget": (3, 30),
    "max_steps": (5, 80),
    "llm_temperature": (0.0, 1.5),
    "tool_output_chars": (1000, 20000),
    "cell_timeout": (10, 600),
}


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

    def settings_view(s: Service) -> dict[str, Any]:
        st = s.settings
        from urllib.parse import urlparse

        return {
            "model": st.llm_model,
            "base_url_host": urlparse(st.llm_base_url).hostname if st.llm_base_url else None,
            "embed_model": st.embed_model if s.embedder else None,
            "rerank_model": st.rerank_model if s.reranker else None,
            "mode": st.mode,
            "step_budget": st.step_budget,
            "max_steps": st.max_steps,
            "llm_temperature": st.llm_temperature,
            "tool_output_chars": st.tool_output_chars,
            "cell_timeout": st.cell_timeout,
            "limits": SETTING_LIMITS,
        }

    @app.get("/api/settings")
    async def get_settings(request: Request):
        return settings_view(svc(request))

    @app.patch("/api/settings")
    async def patch_settings(request: Request, body: SettingsPatch):
        s = svc(request)
        changes = body.model_dump(exclude_none=True)
        if "mode" in changes and changes["mode"] not in ("single", "multi"):
            raise HTTPException(400, "mode 只能是 single 或 multi")
        for key, value in changes.items():
            if key in SETTING_LIMITS:
                lo, hi = SETTING_LIMITS[key]
                if not lo <= value <= hi:
                    raise HTTPException(400, f"{key} 应在 {lo}–{hi} 之间")
            setattr(s.settings, key, value)
        if "llm_temperature" in changes and s._model is not None and hasattr(s._model, "temperature"):
            s._model.temperature = changes["llm_temperature"]
        return settings_view(s)

    @app.get("/api/history")
    async def history(request: Request, limit: int = 50):
        from ..trace_export import list_runs

        live = svc(request).runs
        return [{**r, "live": r["run_id"] in live} for r in list_runs(svc(request).trace, limit=min(limit, 200))]

    @app.get("/api/experiences")
    async def experiences(request: Request, pack: str):
        return [e.to_dict() for e in svc(request).experience.all(pack)]

    @app.delete("/api/experiences/{exp_id}")
    async def delete_experience(request: Request, exp_id: int):
        if not svc(request).experience.delete(exp_id):
            raise HTTPException(404, "经验不存在")
        return {"ok": True}

    @app.get("/api/evals")
    async def eval_reports(request: Request):
        out_dir = svc(request).settings.workspace / "evals"
        items = []
        for f in sorted(out_dir.glob("*.json"), reverse=True) if out_dir.exists() else []:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            items.append({"name": f.stem, "pack": data.get("pack"), "model": data.get("model"), "mode": data.get("mode", "single"),
                          "time": data.get("time"), "summary": data.get("summary")})
        return items

    @app.get("/api/evals/{name}")
    async def eval_report(request: Request, name: str):
        f = svc(request).settings.workspace / "evals" / f"{Path(name).name}.json"
        if not f.exists():
            raise HTTPException(404, "评测报告不存在")
        return json.loads(f.read_text(encoding="utf-8"))

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

    @app.get("/api/sessions/{sid}/tables/{name}/rows")
    async def table_rows(request: Request, sid: str, name: str, offset: int = 0, limit: int = 100):
        session = get_session(request, sid)
        try:
            return await session.table_rows(name, max(offset, 0), min(max(limit, 1), 500))
        except KeyError as e:
            raise HTTPException(404, "表不存在") from e

    @app.post("/api/sessions/{sid}/knowledge/search")
    async def knowledge_search(request: Request, sid: str, body: KnowledgeQuery):
        session = get_session(request, sid)
        hits = await session.kb.search(body.query, top_k=min(max(body.top_k, 1), 20))
        return {"vector": session.kb.vector_enabled, "rerank": bool(session.kb.reranker), "hits": [h.to_dict() for h in hits]}

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
        store = svc(request).trace
        live = rid in svc(request).runs
        if not live and not store.events(rid):
            raise HTTPException(404, "分析不存在")

        async def stream():
            q = store.subscribe(rid)
            try:
                last = after
                for e in store.events(rid, after_seq=after):
                    last = e.seq
                    yield _sse(e)
                    if e.type == T.RUN_FINISHED:
                        return
                if not live:  # a run from an earlier server process: replay only
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
