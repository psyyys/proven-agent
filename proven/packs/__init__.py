"""Domain packs.

A pack is a folder: pack.yaml (metadata + demo datasets), prompt.md (domain guidance),
semantic.yaml (data dictionary and metrics), knowledge/ (RAG documents), evals/ (test questions),
and optionally a kernel helper module. Adding a new domain means adding a folder.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

PACKS_DIR = Path(__file__).parent


@dataclass
class DemoDataset:
    id: str
    name: str
    description: str
    files: list[str]
    semantic: str | None = None
    source: str = ""
    license: str = ""


@dataclass
class Pack:
    id: str
    name: str
    description: str
    dir: Path
    prompt: str = ""
    kit: str | None = None  # python module imported into the kernel, e.g. proven.kit.water
    datasets: list[DemoDataset] = field(default_factory=list)
    examples: list[str] = field(default_factory=list)

    @property
    def semantic_file(self) -> Path:
        return self.dir / "semantic.yaml"

    @property
    def knowledge_dir(self) -> Path:
        return self.dir / "knowledge"

    @property
    def rules_file(self) -> Path:
        return self.dir / "rules.yaml"

    @property
    def evals_file(self) -> Path:
        return self.dir / "evals" / "questions.yaml"

    def knowledge_files(self) -> list[Path]:
        if not self.knowledge_dir.exists():
            return []
        return sorted(p for p in self.knowledge_dir.rglob("*") if p.is_file() and not p.name.startswith("."))

    def rules(self):
        """Review rules: the general pack's rules plus this pack's own (see proven/rules.py)."""
        from ..rules import load_rules

        return load_rules(self.dir, PACKS_DIR / "general")

    def dataset(self, dataset_id: str) -> DemoDataset | None:
        return next((d for d in self.datasets if d.id == dataset_id), None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "datasets": [d.__dict__ for d in self.datasets],
            "examples": self.examples,
            "knowledge": [p.name for p in self.knowledge_files()],
        }


def load_pack(path: Path) -> Pack:
    meta = yaml.safe_load((path / "pack.yaml").read_text(encoding="utf-8"))
    prompt_file = path / "prompt.md"
    return Pack(
        id=meta["id"],
        name=meta["name"],
        description=meta.get("description", ""),
        dir=path,
        prompt=prompt_file.read_text(encoding="utf-8") if prompt_file.exists() else "",
        kit=meta.get("kit"),
        datasets=[DemoDataset(**d) for d in meta.get("datasets", [])],
        examples=meta.get("examples", []),
    )


def discover_packs(extra_dirs: list[Path] | None = None) -> dict[str, Pack]:
    packs: dict[str, Pack] = {}
    for root in [PACKS_DIR, *(extra_dirs or [])]:
        for d in sorted(root.iterdir()):
            if (d / "pack.yaml").exists():
                pack = load_pack(d)
                packs[pack.id] = pack
    return packs
