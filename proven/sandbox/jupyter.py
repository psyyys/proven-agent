"""Local Jupyter-kernel executor: stateful, so variables persist across steps like a notebook."""

from __future__ import annotations

import asyncio
import json
import queue
import sys
import time
from pathlib import Path

from jupyter_client import AsyncKernelManager

from .base import CellResult, Executor, Output, strip_ansi

BOOTSTRAP = """
import warnings
warnings.filterwarnings("ignore")
import pandas as pd, numpy as np, duckdb
import plotly.express as px, plotly.graph_objects as go, plotly.io as pio
pio.renderers.default = "plotly_mimetype"
pio.templates.default = "plotly_white"
px.defaults.color_discrete_sequence = ["#0f766e", "#d97706", "#2563eb", "#be185d", "#65a30d", "#7c3aed"]
pd.set_option("display.max_rows", 40)
pd.set_option("display.max_columns", 30)
pd.set_option("display.width", 200)
pd.set_option("display.html.table_schema", True)
"""


class JupyterExecutor(Executor):
    def __init__(self, workdir: Path, default_timeout: int = 120):
        self.workdir = workdir
        self.default_timeout = default_timeout
        self._km: AsyncKernelManager | None = None
        self._kc = None
        self._counter = 0
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        self.workdir.mkdir(parents=True, exist_ok=True)
        self._km = AsyncKernelManager(kernel_name="python3")
        # Use the interpreter running proven, so the kernel sees the same installed packages.
        self._km.kernel_spec.argv[0] = sys.executable
        await self._km.start_kernel(cwd=str(self.workdir))
        self._kc = self._km.client()
        self._kc.start_channels()
        await self._kc.wait_for_ready(timeout=60)
        result = await self.run(BOOTSTRAP, record=False)
        if not result.ok:
            raise RuntimeError(f"kernel bootstrap failed: {result.error}")

    async def run(self, code: str, timeout: int | None = None, record: bool = True) -> CellResult:
        async with self._lock:
            return await self._run(code, timeout or self.default_timeout, record)

    async def _run(self, code: str, timeout: int, record: bool) -> CellResult:
        assert self._kc is not None, "executor not started"
        if record:
            self._counter += 1
            cell_id = f"C{self._counter}"
        else:
            cell_id = "setup"
        result = CellResult(cell_id=cell_id, code=code)
        started = time.monotonic()
        msg_id = self._kc.execute(code, store_history=record, allow_stdin=False)
        deadline = started + timeout

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                await self._km.interrupt_kernel()
                result.error = {"name": "TimeoutError", "value": f"代码运行超过 {timeout} 秒，已中断", "traceback": ""}
                await self._drain(msg_id)
                break
            try:
                msg = await self._kc.get_iopub_msg(timeout=min(remaining, 1.0))
            except (queue.Empty, asyncio.TimeoutError):
                continue
            if msg.get("parent_header", {}).get("msg_id") != msg_id:
                continue
            mtype, content = msg["msg_type"], msg["content"]
            if mtype == "stream":
                if content["name"] == "stdout":
                    result.stdout += content["text"]
                else:
                    result.stderr += content["text"]
            elif mtype in ("execute_result", "display_data"):
                out = _parse_display(content.get("data", {}))
                if out:
                    result.outputs.append(out)
            elif mtype == "error":
                result.error = {
                    "name": content["ename"],
                    "value": content["evalue"],
                    "traceback": strip_ansi("\n".join(content.get("traceback", []))),
                }
            elif mtype == "status" and content["execution_state"] == "idle":
                break

        result.duration_ms = int((time.monotonic() - started) * 1000)
        return result

    async def _drain(self, msg_id: str) -> None:
        """After an interrupt, consume messages until the kernel reports idle for this request."""
        end = time.monotonic() + 10
        while time.monotonic() < end:
            try:
                msg = await self._kc.get_iopub_msg(timeout=1.0)
            except (queue.Empty, asyncio.TimeoutError):
                continue
            if (
                msg.get("parent_header", {}).get("msg_id") == msg_id
                and msg["msg_type"] == "status"
                and msg["content"]["execution_state"] == "idle"
            ):
                return

    async def shutdown(self) -> None:
        if self._kc:
            self._kc.stop_channels()
        if self._km:
            await self._km.shutdown_kernel(now=True)
        self._kc = self._km = None


def _parse_display(data: dict) -> Output | None:
    text = data.get("text/plain", "")
    if "application/vnd.plotly.v1+json" in data:
        fig = data["application/vnd.plotly.v1+json"]
        title = (fig.get("layout", {}).get("title") or {}).get("text") or ""
        return Output(kind="figure", data=fig, text=f"[图表] {title}".strip())
    if "application/vnd.dataresource+json" in data:
        res = data["application/vnd.dataresource+json"]
        columns = [f["name"] for f in res.get("schema", {}).get("fields", [])]
        rows = res.get("data", [])
        # A default RangeIndex adds nothing for the reader; drop it.
        if res.get("schema", {}).get("primaryKey") == ["index"] and all(r.get("index") == i for i, r in enumerate(rows)):
            columns = [c for c in columns if c != "index"]
            rows = [{k: v for k, v in r.items() if k != "index"} for r in rows]
        table = {"columns": columns, "rows": rows}
        # Round-trip through JSON so numpy/NaN values become plain JSON values.
        table = json.loads(json.dumps(table, default=str).replace("NaN", "null"))
        return Output(kind="table", data=table, text=text)
    if "image/png" in data:
        return Output(kind="image", data=data["image/png"], text="")
    if text:
        return Output(kind="text", data=text, text=text)
    return None
