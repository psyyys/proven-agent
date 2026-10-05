"""The built-in tools available to every pack."""

from __future__ import annotations

import json
import re

from .. import trace as T
from ..findings import unsupported_numbers
from .registry import Tool, ToolRegistry, ToolResult, params


async def run_python(ctx, args) -> ToolResult:
    code = args.get("code", "")
    if not code.strip():
        return ToolResult("code 不能为空", ok=False)
    cell = await ctx.execute(code, purpose=args.get("purpose", ""))
    return ToolResult(cell.for_model(ctx.settings.tool_output_chars), ok=cell.ok, data={"cell_id": cell.cell_id})


async def query_sql(ctx, args) -> ToolResult:
    query = (args.get("sql") or "").strip().rstrip(";")
    if not query:
        return ToolResult("sql 不能为空", ok=False)
    var = args.get("result_var") or "result"
    if not var.isidentifier():
        return ToolResult(f"result_var 不是合法的变量名：{var}", ok=False)
    code = f'{var} = sql("""\n{query}\n""")\n{var}'
    cell = await ctx.execute(code, purpose=args.get("purpose", ""))
    return ToolResult(cell.for_model(ctx.settings.tool_output_chars), ok=cell.ok, data={"cell_id": cell.cell_id})


async def inspect_data(ctx, args) -> ToolResult:
    table = args.get("table")
    profiles = ctx.session.profiles
    if table:
        if table not in profiles:
            return ToolResult(f"没有名为 {table} 的表。可用的表：{', '.join(profiles) or '无'}", ok=False)
        return ToolResult(json.dumps(profiles[table], ensure_ascii=False, indent=1), data={"table": table})
    overview = {name: {"rows": p["rows"], "columns": [c["name"] for c in p["columns"]]} for name, p in profiles.items()}
    return ToolResult(json.dumps(overview, ensure_ascii=False, indent=1))


async def search_knowledge(ctx, args) -> ToolResult:
    query = args.get("query", "")
    kb = ctx.session.kb
    if not kb.chunks:
        return ToolResult("知识库为空：当前没有可检索的文档。")
    hits = await kb.search(query, top_k=int(args.get("top_k") or 5))
    ctx.emit(T.RETRIEVAL, query=query, hits=[h.to_dict() for h in hits], vector=kb.vector_enabled)
    if not hits:
        return ToolResult("没有检索到相关内容。")
    lines = []
    for h in hits:
        loc = h.chunk.source + (f" 第{h.chunk.page}页" if h.chunk.page else "") + (f" · {h.chunk.heading}" if h.chunk.heading else "")
        lines.append(f"[{h.chunk.id}] ({loc})\n{h.chunk.text}")
    return ToolResult("\n\n".join(lines), data={"chunk_ids": [h.chunk.id for h in hits]})


async def lookup_semantic(ctx, args) -> ToolResult:
    entries = ctx.session.semantic.lookup(args.get("query", ""), ctx.session.semantic_datasets)
    if not entries:
        return ToolResult("语义层中没有匹配的定义。可以按常规做法计算，并在结论中说明口径。")
    return ToolResult("\n".join(f"- [{e.kind}] {e.name}：{e.text}" for e in entries), data={"entries": [e.to_dict() for e in entries]})


async def recall_experience(ctx, args) -> ToolResult:
    items = ctx.session.experience.recall(ctx.session.pack.id, args.get("question", ""))
    if not items:
        return ToolResult("经验库中没有相似问题。")
    return ToolResult(
        "\n\n".join(f"相似问题：{e.question}\n已验证的代码：\n```python\n{e.code}\n```" for e in items)
        + "\n\n注意：仅供参考，数据可能已变化，必须重新运行。",
        data={"experience_ids": [e.id for e in items]},
    )


async def record_finding(ctx, args) -> ToolResult:
    claim = (args.get("claim") or "").strip()
    evidence = (args.get("evidence") or "").strip().upper()
    if not claim or not evidence:
        return ToolResult("claim 和 evidence 都必须填写", ok=False)

    ids = [x for x in re.split(r"[\s,，、;；]+", evidence) if x]
    texts: list[str] = []
    for eid in ids:
        if eid.startswith("C"):
            cell = ctx.session.cells.get(eid)
            if cell is None:
                return ToolResult(f"找不到代码单元 {eid}。", ok=False)
            text = cell.plain_text()
            if not text.strip():
                reason = "运行出错且没有输出" if not cell.ok else "没有任何输出"
                return ToolResult(f"{eid} {reason}，不能作为证据。请先运行代码把结果 print 出来。", ok=False)
            # Numbers written in the code are visible parameters (thresholds, periods), so they count too.
            # An errored cell still counts for what it printed before the error.
            texts.append(text + "\n" + cell.code)
        elif eid.startswith("D"):
            chunk = ctx.session.kb.get(eid)
            if chunk is None:
                return ToolResult(f"找不到文档片段 {eid}。", ok=False)
            texts.append(chunk.text)
        else:
            return ToolResult(f"evidence 编号 {eid} 无效：应为代码单元（如 C3）或文档片段（如 D12），多个用逗号分隔", ok=False)
    kinds = {i[0] for i in ids}
    etype = "cell" if kinds == {"C"} else "doc" if kinds == {"D"} else "mixed"
    evidence = ",".join(ids)

    missing = unsupported_numbers(claim, "\n".join(texts) + "\n" + ctx.run.question)
    if missing:
        hint = _where_else(ctx, missing, exclude=set(ids))
        return ToolResult(
            f"登记被拒绝：数字 {', '.join(missing)} 没有出现在 {evidence} 的输出或代码中。{hint}"
            "如果是新算出的数字，请先运行代码把它 print 出来再登记；不要自己心算。"
            "一条结论只写一个主题，数字少而准更容易通过。",
            ok=False,
            data={"rejected": True, "missing": missing},
        )

    value = args.get("value")
    try:
        value = float(value) if value is not None else None
    except (TypeError, ValueError):
        value = None
    f = ctx.run.findings.add(claim, etype, evidence, value)
    ctx.emit(T.FINDING, **f.to_dict())
    return ToolResult(f"已登记 {f.id}：{claim}（证据 {evidence}）", data={"finding_id": f.id})


def _where_else(ctx, missing: list[str], exclude: set[str]) -> str:
    """Point the model at other cells of this run whose output contains the missing numbers."""
    from ..findings import extract_numbers, matches, numbers_in_evidence

    found: dict[str, list[str]] = {}
    targets = [n for n in extract_numbers(" ".join(missing), skip_trivial=False)]
    for cid in reversed(ctx.run.cell_ids):
        if cid in exclude:
            continue
        values = numbers_in_evidence(ctx.session.cells[cid].plain_text())
        for n in targets:
            if any(matches(n, v) for v in values):
                found.setdefault(n.raw, []).append(cid)
    if not found:
        return ""
    parts = [f"{num} 出现在 {'、'.join(cids[:3])}" for num, cids in found.items()]
    return "提示：" + "；".join(parts) + "，可以同时引用多个证据，如 evidence=\"C6,C8\"。"


async def ask_user(ctx, args) -> ToolResult:
    q = args.get("question", "")
    options = args.get("options") or []
    ctx.run.pending_question = q + (f"（可选：{' / '.join(options)}）" if options else "")
    ctx.emit(T.ASK_USER, question=q, options=options)
    return ToolResult("已向用户提问，等待回答。", stop=True, data={"question": q})


def builtin_tools() -> ToolRegistry:
    return ToolRegistry(
        [
            Tool(
                "run_python",
                "在有状态的 Python 内核中运行代码（变量跨步骤保留）。所有计算都必须通过它或 query_sql 完成。"
                "要查看的结果必须 print() 或作为最后一行表达式输出；图表用 plotly 创建后调用 fig.show()。",
                params(
                    {
                        "code": {"type": "string", "description": "要运行的 Python 代码"},
                        "purpose": {"type": "string", "description": "这段代码要做什么（一句话，展示给用户）"},
                    },
                    ["code", "purpose"],
                ),
                run_python,
            ),
            Tool(
                "query_sql",
                "用 SQL（DuckDB 语法）查询已加载的表，结果保存为 DataFrame 变量并显示。适合筛选、聚合、多表关联。",
                params(
                    {
                        "sql": {"type": "string", "description": "SQL 语句，表名即已加载的表名"},
                        "purpose": {"type": "string", "description": "这个查询要做什么（一句话）"},
                        "result_var": {"type": "string", "description": "保存结果的变量名，默认 result"},
                    },
                    ["sql", "purpose"],
                ),
                query_sql,
            ),
            Tool(
                "inspect_data",
                "查看数据画像：不传 table 返回所有表概览；传 table 返回该表每列的类型、缺失、唯一值、统计量和样例。",
                params({"table": {"type": "string", "description": "表名（可选）"}}, []),
                inspect_data,
            ),
            Tool(
                "lookup_semantic",
                "查询语义层：指标口径、字段含义、表关系、业务术语。计算任何已定义指标前先查这里。",
                params({"query": {"type": "string", "description": "要查的指标、字段或术语"}}, ["query"]),
                lookup_semantic,
            ),
            Tool(
                "search_knowledge",
                "检索知识库文档（规范、方法说明、业务资料），返回带编号的原文片段（如 D12），可作为结论证据。",
                params(
                    {
                        "query": {"type": "string", "description": "检索内容"},
                        "top_k": {"type": "integer", "description": "返回片段数，默认 5"},
                    },
                    ["query"],
                ),
                search_knowledge,
            ),
            Tool(
                "recall_experience",
                "检索经验库中相似问题的已验证代码，作为写法参考。",
                params({"question": {"type": "string", "description": "当前问题"}}, ["question"]),
                recall_experience,
            ),
            Tool(
                "record_finding",
                "登记一条关键结论及其证据。claim 中的每个数字都必须出现在证据的输出里，否则会被拒绝。"
                "最终报告只能使用已登记的结论。",
                params(
                    {
                        "claim": {"type": "string", "description": "结论陈述，包含具体数字，如：2013 年总销售额为 2,328.60 美元"},
                        "evidence": {"type": "string", "description": "证据编号：代码单元（如 C3）或文档片段（如 D12）；多个用逗号分隔，如 C6,C8"},
                        "value": {"type": "number", "description": "该结论的核心数值（可选）"},
                    },
                    ["claim", "evidence"],
                ),
                record_finding,
            ),
            Tool(
                "ask_user",
                "当问题存在会显著影响结论的歧义时向用户提问。会暂停分析，等待用户回答。小歧义请自行合理假设。",
                params(
                    {
                        "question": {"type": "string", "description": "要问用户的问题"},
                        "options": {"type": "array", "items": {"type": "string"}, "description": "可选的候选答案"},
                    },
                    ["question"],
                ),
                ask_user,
            ),
        ]
    )
