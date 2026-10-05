"""Semantic layer: data dictionary, table relationships and metric definitions.

Lets the agent use agreed definitions ("what exactly is repeat-purchase rate?") instead of
inventing its own, and gives the model the join paths between tables.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .rag.index import tokenize


@dataclass
class SemanticEntry:
    kind: str  # "table" | "column" | "metric" | "term" | "relationship"
    name: str
    text: str
    dataset: str

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "name": self.name, "text": self.text, "dataset": self.dataset}


@dataclass
class SemanticLayer:
    datasets: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def load(cls, paths: list[Path]) -> "SemanticLayer":
        layer = cls()
        for p in paths:
            if p.exists():
                data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
                layer.datasets.update(data.get("datasets", {}))
        return layer

    def entries(self, only: set[str] | None = None) -> list[SemanticEntry]:
        out: list[SemanticEntry] = []
        for ds_name, ds in self.datasets.items():
            if only is not None and ds_name not in only:
                continue
            for tname, t in (ds.get("tables") or {}).items():
                desc = t.get("description", "")
                pk = t.get("primary_key")
                out.append(SemanticEntry("table", tname, f"{desc}" + (f"（主键：{pk}）" if pk else ""), ds_name))
                for cname, cdesc in (t.get("columns") or {}).items():
                    out.append(SemanticEntry("column", f"{tname}.{cname}", str(cdesc), ds_name))
            for rel in ds.get("relationships") or []:
                out.append(SemanticEntry("relationship", rel, rel, ds_name))
            for m in ds.get("metrics") or []:
                parts = [m.get("definition", "")]
                if m.get("formula"):
                    parts.append(f"计算方法：{m['formula']}")
                if m.get("notes"):
                    parts.append(f"注意：{m['notes']}")
                aliases = m.get("aliases") or []
                name = m["name"] + (f"（{'/'.join(aliases)}）" if aliases else "")
                out.append(SemanticEntry("metric", name, "；".join(p for p in parts if p), ds_name))
            for term, tdesc in (ds.get("glossary") or {}).items():
                out.append(SemanticEntry("term", term, str(tdesc), ds_name))
        return out

    def lookup(self, query: str, datasets: set[str] | None = None, limit: int = 8) -> list[SemanticEntry]:
        q_tokens = set(tokenize(query))
        q_lower = query.lower()
        scored = []
        for e in self.entries(datasets):
            name_l = e.name.lower()
            score = 0.0
            if name_l and (name_l in q_lower or any(n and n in q_lower for n in name_l.replace("（", "/").replace("）", "").split("/"))):
                score += 3
            overlap = q_tokens & set(tokenize(e.name + " " + e.text))
            score += len(overlap) * (1.5 if e.kind == "metric" else 1.0)
            if score > 0:
                scored.append((score, e))
        scored.sort(key=lambda x: -x[0])
        return [e for _, e in scored[:limit]]

    def summary(self, datasets: set[str] | None = None) -> str:
        """Compact overview for the system prompt: tables, joins and metric names."""
        lines = []
        for ds_name, ds in self.datasets.items():
            if datasets is not None and ds_name not in datasets:
                continue
            lines.append(f"### 数据集 {ds_name}：{ds.get('description', '')}")
            for tname, t in (ds.get("tables") or {}).items():
                lines.append(f"- 表 {tname}：{t.get('description', '')}")
            rels = ds.get("relationships") or []
            if rels:
                lines.append("- 关联关系：" + "；".join(rels))
            metrics = [m["name"] for m in ds.get("metrics") or []]
            if metrics:
                lines.append("- 已定义指标（计算前用 lookup_semantic 查口径）：" + "、".join(metrics))
        return "\n".join(lines)
