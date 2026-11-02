"""Export a session as a Jupyter notebook so anyone can re-run the analysis and get the same numbers."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import nbformat
from nbformat import v4

from .agent import Session
from .sandbox import CellResult


def _outputs(cell: CellResult) -> list:
    outs = []
    if cell.stdout:
        outs.append(v4.new_output("stream", name="stdout", text=cell.stdout))
    if cell.stderr:
        outs.append(v4.new_output("stream", name="stderr", text=cell.stderr))
    for o in cell.outputs:
        if o.kind == "figure":
            outs.append(v4.new_output("display_data", data={"application/vnd.plotly.v1+json": o.data, "text/plain": o.text}))
        elif o.kind == "image":
            outs.append(v4.new_output("display_data", data={"image/png": o.data}))
        else:
            outs.append(v4.new_output("display_data", data={"text/plain": o.text}))
    if cell.error:
        outs.append(v4.new_output("error", ename=cell.error["name"], evalue=cell.error["value"], traceback=cell.error["traceback"].splitlines()))
    return outs


_STRING = re.compile(r"'(?:[^'\\]|\\.)*'")


def portable(code: str, base: Path | None = None) -> str:
    """Rewrite absolute file paths under `base` (the directory Proven runs from, normally the project root)
    as relative POSIX paths, so the notebook runs on another machine and does not reveal local folders."""
    base = (base or Path.cwd()).resolve()

    def sub(m: re.Match) -> str:
        try:
            rel = Path(ast.literal_eval(m.group(0))).resolve().relative_to(base)
        except (ValueError, SyntaxError):
            return m.group(0)
        return repr(rel.as_posix())

    return _STRING.sub(sub, code)


def export_notebook(session: Session) -> str:
    nb = v4.new_notebook()
    nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
    nb.cells.append(v4.new_markdown_cell(f"# Proven 分析记录\n\n领域包：{session.pack.name}　会话：`{session.id}`\n\n"
                                         "在项目根目录打开本 Notebook，运行下面的准备单元会重新加载数据，之后每个单元都可以复现报告中的数字。"))
    setup = ["import pandas as pd, numpy as np, duckdb", "import plotly.express as px, plotly.graph_objects as go",
             *(portable(c) for c in session.setup_code)]
    nb.cells.append(v4.new_code_cell("# 准备：导入与加载数据\n" + "\n".join(setup)))

    for run in session.runs.values():
        md = [f"## 问题：{run.question}"]
        if run.plan:
            md.append("**计划**\n\n" + "\n".join(f"{i}. {s['title']}：{s.get('detail', '')}" for i, s in enumerate(run.plan.get("steps", []), 1)))
        nb.cells.append(v4.new_markdown_cell("\n\n".join(md)))
        for cid in run.cell_ids:
            cell = session.cells[cid]
            c = v4.new_code_cell(f"# [{cid}]\n{cell.code}")
            c.outputs = _outputs(cell)
            nb.cells.append(c)
        if run.findings.active():
            nb.cells.append(v4.new_markdown_cell("### 已登记结论\n\n" + "\n".join(f"- **{f.id}** {f.claim}（证据 {f.evidence_id}）" for f in run.findings.active())))
        if run.report:
            nb.cells.append(v4.new_markdown_cell("### 报告\n\n" + run.report))
    return nbformat.writes(nb)


def to_json(session: Session) -> dict:
    return json.loads(export_notebook(session))
