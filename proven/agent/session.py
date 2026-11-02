"""A session: one kernel, its loaded tables and documents, and the conversation across runs."""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from ..config import Settings
from ..experience import ExperienceStore
from ..packs import Pack
from ..rag import KnowledgeBase
from ..sandbox import CellResult, Executor, JupyterExecutor
from ..semantic import SemanticLayer
from ..trace import TraceStore

DATA_SUFFIXES = {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".parquet", ".json"}
DOC_SUFFIXES = {".pdf", ".md", ".markdown", ".docx"}


class Session:
    def __init__(
        self,
        pack: Pack,
        settings: Settings,
        trace: TraceStore,
        experience: ExperienceStore,
        kb: KnowledgeBase,
        executor: Executor | None = None,
        session_id: str | None = None,
        lessons=None,
    ):
        self.id = session_id or uuid.uuid4().hex[:10]
        self.pack = pack
        self.settings = settings
        self.trace = trace
        self.experience = experience
        self.lessons = lessons  # LessonStore, or None to run without lessons
        self.kb = kb
        self.dir = settings.workspace / "sessions" / self.id
        self.files_dir = self.dir / "files"
        self.executor = executor or JupyterExecutor(self.dir, settings.cell_timeout)
        self.semantic = SemanticLayer.load([pack.semantic_file])
        self.semantic_datasets: set[str] = set()
        self.profiles: dict[str, dict[str, Any]] = {}
        self.tables: dict[str, dict[str, Any]] = {}  # name -> {"file", "dataset"}
        self.documents: list[dict[str, Any]] = []
        self.cells: dict[str, CellResult] = {}
        self.setup_code: list[str] = []
        self.history: list[dict[str, str]] = []
        self.runs: dict[str, Any] = {}
        self._baseline_vars: list[str] = []

    async def start(self) -> None:
        self.files_dir.mkdir(parents=True, exist_ok=True)
        await self.executor.start()
        imports = ["from proven.kit.core import load_table, sql, tables, profile"]
        if self.pack.kit:
            imports.append(f"from {self.pack.kit} import *")
        await self._setup("\n".join(imports))
        base = await self.executor.run("import json as _j\nprint(_j.dumps(list(get_ipython().user_ns)))", record=False)
        self._baseline_vars = json.loads(base.stdout.strip().splitlines()[-1]) if base.ok and base.stdout.strip() else []
        files = self.pack.knowledge_files()
        if files:
            await self.kb.add_files(files)
            self.documents += [{"name": p.name, "origin": "pack"} for p in files]

    async def _setup(self, code: str) -> Any:
        result = await self.executor.run(code, record=False)
        if not result.ok:
            raise RuntimeError(f"{result.error['name']}: {result.error['value']}")
        self.setup_code.append(code)
        return result

    async def load_table(self, path: Path, dataset: str | None = None, name: str | None = None) -> dict[str, Any]:
        call = f"load_table({str(path.resolve())!r}" + (f", name={name!r}" if name else "") + ")"
        result = await self._setup(f"_name = {call}\nprint(_name)")
        table = result.stdout.strip().splitlines()[-1]
        prof = await self.executor.run(f"import json as _j; print(_j.dumps(profile({table!r}), ensure_ascii=False, default=str))", record=False)
        if not prof.ok:
            raise RuntimeError(f"profiling failed: {prof.error}")
        self.profiles[table] = json.loads(prof.stdout.strip().splitlines()[-1])
        self.tables[table] = {"file": path.name, "dataset": dataset}
        return self.profiles[table]

    async def load_demo(self, dataset_id: str) -> list[str]:
        ds = self.pack.dataset(dataset_id)
        if ds is None:
            raise KeyError(f"pack {self.pack.id} has no dataset {dataset_id}")
        paths = [self.settings.data_dir / f for f in ds.files]
        missing = [str(p) for p in paths if not p.exists()]
        if missing:
            raise FileNotFoundError(
                f"示例数据未下载：{', '.join(missing)}。请先运行 python scripts/fetch_datasets.py"
            )
        names = []
        for p in paths:
            prof = await self.load_table(p, dataset=ds.semantic)
            names.append(prof["name"])
        if ds.semantic:
            self.semantic_datasets.add(ds.semantic)
        return names

    async def add_upload(self, filename: str, content: bytes) -> dict[str, Any]:
        safe = Path(filename).name
        dest = self.files_dir / safe
        dest.write_bytes(content)
        suffix = dest.suffix.lower()
        if suffix in DOC_SUFFIXES or (suffix == ".txt" and not _looks_tabular(dest)):
            chunks = await self.kb.add_files([dest])
            self.documents.append({"name": safe, "origin": "upload", "chunks": len(chunks)})
            return {"kind": "document", "name": safe, "chunks": len(chunks)}
        if suffix in DATA_SUFFIXES:
            prof = await self.load_table(dest)
            return {"kind": "table", "name": prof["name"], "rows": prof["rows"]}
        raise ValueError(f"不支持的文件类型：{suffix}")

    async def kernel_variables(self) -> list[dict[str, str]]:
        """Variables created by analysis code (not loaded tables, modules or helpers)."""
        code = (
            "from proven.kit.core import _user_variables as _uv\nimport json as _j\n"
            f"print(_j.dumps(_uv(set({self._baseline_vars!r})), ensure_ascii=False))"
        )
        r = await self.executor.run(code, record=False)
        if not r.ok or not r.stdout.strip():
            return []
        return json.loads(r.stdout.strip().splitlines()[-1])

    async def table_rows(self, name: str, offset: int = 0, limit: int = 100) -> dict[str, Any]:
        """A page of a loaded table, read from the kernel (the table as the agent sees it)."""
        if name not in self.profiles:
            raise KeyError(name)
        code = (
            "import json as _j\n"
            f"_t = tables[{name!r}]\n"
            f"_p = _t.iloc[{int(offset)}:{int(offset) + int(limit)}]\n"
            "print(_j.dumps({'columns': [str(c) for c in _p.columns], 'total': int(len(_t)), "
            "'rows': _j.loads(_p.to_json(orient='records', date_format='iso', force_ascii=False))}, ensure_ascii=False))"
        )
        r = await self.executor.run(code, record=False)
        if not r.ok:
            raise RuntimeError(f"{r.error['name']}: {r.error['value']}")
        return json.loads(r.stdout.strip().splitlines()[-1])

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "pack": self.pack.id,
            "tables": [{"name": n, "rows": p["rows"], "columns": len(p["columns"]), **self.tables[n]} for n, p in self.profiles.items()],
            "documents": self.documents,
            "knowledge_chunks": len(self.kb.chunks),
            "vector_search": self.kb.vector_enabled,
            "runs": list(self.runs),
        }

    async def close(self, remove_files: bool = False) -> None:
        await self.executor.shutdown()
        if remove_files:
            shutil.rmtree(self.dir, ignore_errors=True)


def _looks_tabular(path: Path) -> bool:
    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:2000].splitlines()[:5]
    except OSError:
        return False
    return len(head) >= 2 and all(line.count(",") >= 1 or line.count("\t") >= 1 for line in head)
