"""Code executor interface.

The agent's code always runs through an Executor. v1 ships a local Jupyter-kernel implementation;
a Docker or remote (E2B-style) executor can be added by implementing the same interface.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Output:
    kind: str  # "text" | "table" | "figure" | "image"
    data: Any
    # A plain-text rendering, used both for the model and for evidence checks.
    text: str = ""


@dataclass
class CellResult:
    cell_id: str
    code: str
    stdout: str = ""
    stderr: str = ""
    outputs: list[Output] = field(default_factory=list)
    error: dict[str, Any] | None = None  # {"name", "value", "traceback"}
    duration_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.error is None

    def plain_text(self) -> str:
        """Everything the cell printed or displayed, as text. Findings are checked against this."""
        parts = [self.stdout] + [o.text for o in self.outputs if o.text]
        return "\n".join(p for p in parts if p)

    def for_model(self, limit: int) -> str:
        parts: list[str] = []
        if self.stdout:
            parts.append(self.stdout.rstrip())
        for o in self.outputs:
            if o.kind == "figure":
                parts.append(f"[图表已生成：{o.data.get('layout', {}).get('title', {}).get('text') or '未命名'}]")
            elif o.kind == "image":
                parts.append("[图片已生成]")
            elif o.text:
                parts.append(o.text.rstrip())
        if self.stderr.strip():
            parts.append("[stderr]\n" + self.stderr.strip()[-1500:])
        if self.error:
            # The error line first, then only the user-code frame: library internals waste context.
            tb = self.error.get("traceback", "")
            frame = _user_frame(tb)
            parts.append(f"[ERROR] {self.error['name']}: {self.error['value'][:800]}" + (f"\n{frame}" if frame else ""))
        text = "\n".join(parts) if parts else "(无输出。如需查看结果，请 print() 出来)"
        if len(text) > limit:
            head = text[: limit * 2 // 3]
            tail = text[-limit // 3 :]
            text = f"{head}\n...[输出过长，已截断 {len(text) - limit} 字符；完整输出见追溯记录]...\n{tail}"
        return f"[{self.cell_id}]\n{text}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _user_frame(tb: str, limit: int = 700) -> str:
    """The traceback frame that points into the cell's own code ("Cell In[5], line 6")."""
    blocks = re.split(r"\n(?=Cell In\[|File )", tb)
    cell = [b for b in blocks if b.startswith("Cell In[")]
    text = cell[-1] if cell else (blocks[-1] if blocks else "")
    return text.strip()[:limit]


_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def strip_ansi(s: str) -> str:
    return _ANSI.sub("", s)


class Executor(ABC):
    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def run(self, code: str, timeout: int | None = None, record: bool = True) -> CellResult:
        """Execute code. record=False runs setup code that should not appear as an evidence cell."""

    @abstractmethod
    async def shutdown(self) -> None: ...
