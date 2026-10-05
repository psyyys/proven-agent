"""Document parsing and chunking.

v1 uses pypdf / python-docx text extraction. Layout-aware parsing (MinerU / Docling) for tables
and formulas is a planned upgrade; the Chunk format will not change.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path

SUPPORTED = {".pdf", ".md", ".markdown", ".txt", ".docx"}


@dataclass
class Chunk:
    id: str  # assigned by the knowledge base, e.g. "D12"
    source: str  # file name
    text: str
    page: int | None = None
    heading: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Section:
    text: str
    page: int | None
    heading: str


def _sections_markdown(text: str) -> list[Section]:
    sections: list[Section] = []
    stack: list[str] = []
    buf: list[str] = []

    def flush():
        if "".join(buf).strip():
            sections.append(Section("\n".join(buf).strip(), None, " > ".join(stack)))
        buf.clear()

    for line in text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            flush()
            level = len(m.group(1))
            stack[:] = stack[: level - 1] + [m.group(2).strip()]
        else:
            buf.append(line)
    flush()
    return sections


def read_sections(path: Path) -> list[Section]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return [Section(page.extract_text() or "", i + 1, "") for i, page in enumerate(reader.pages)]
    if suffix == ".docx":
        import docx

        doc = docx.Document(str(path))
        lines = []
        for p in doc.paragraphs:
            style = (p.style.name or "").lower() if p.style is not None else ""
            if style.startswith("heading"):
                level = re.findall(r"\d+", style)
                lines.append("#" * int(level[0] if level else 1) + " " + p.text)
            else:
                lines.append(p.text)
        return _sections_markdown("\n".join(lines))
    text = path.read_text(encoding="utf-8", errors="replace")
    if suffix in (".md", ".markdown"):
        return _sections_markdown(text)
    return [Section(text, None, "")]


_SENT_END = re.compile(r"(?<=[。！？；.!?;])\s*|\n{2,}")


def chunk_sections(sections: list[Section], source: str, max_chars: int = 600, overlap: int = 100) -> list[Chunk]:
    """Split sections into chunks of roughly max_chars, breaking at sentence boundaries."""
    chunks: list[Chunk] = []
    for sec in sections:
        text = re.sub(r"[ \t]+", " ", sec.text).strip()
        if not text:
            continue
        sentences = [s for s in _SENT_END.split(text) if s and s.strip()]
        cur = ""
        for s in sentences:
            if len(cur) + len(s) > max_chars and cur:
                chunks.append(Chunk("", source, cur.strip(), sec.page, sec.heading))
                cur = cur[-overlap:] if overlap else ""
            # A single sentence longer than max_chars is hard-split.
            while len(s) > max_chars:
                chunks.append(Chunk("", source, (cur + s[:max_chars]).strip(), sec.page, sec.heading))
                s, cur = s[max_chars - overlap :], ""
            sep = " " if cur and _is_latin(cur[-1]) and _is_latin(s[0]) else ""
            cur += sep + s
        if cur.strip():
            chunks.append(Chunk("", source, cur.strip(), sec.page, sec.heading))
    return chunks


def _is_latin(ch: str) -> bool:
    return ch.isascii() and ch.isalnum()


def parse_file(path: Path, max_chars: int = 600, overlap: int = 100) -> list[Chunk]:
    return chunk_sections(read_sections(path), path.name, max_chars, overlap)
