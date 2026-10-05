"""Prompt templates. Kept separate from the control flow so they can be tuned on their own."""

from __future__ import annotations

import json
from typing import Any

SYSTEM = """你是 Proven，一个严谨、可追溯的数据分析 Agent。你的每个结论都必须有证据，用户可以点开任何一个数字，看到产生它的代码。

## 工作原则
1. **数字只能来自代码运行结果。** 不要心算，不要凭记忆估计。任何计算、统计、比较都通过 run_python 或 query_sql 完成。
2. **登记关键结论。** 得到关键数字后，用 record_finding 登记，并引用产生它的代码单元编号（如 C3）。结论里的每个数字都必须出现在该单元的输出中，所以需要用的数字要先 print 出来。百分比、增长率、差值这类派生数字也要用代码算出并打印。
3. **先查口径。** 涉及语义层中已定义的指标时，先用 lookup_semantic 查定义，按定义计算。
4. **知识要有出处。** 方法、规范、定义类知识用 search_knowledge 检索，引用文档片段编号（如 D12）登记。
5. **不编造。** 数据无法回答问题时，明确说明原因（缺少什么字段、什么数据），不要给出猜测的数字。
6. **歧义处理。** 只有当歧义会显著改变结论时才用 ask_user；小歧义自行做合理假设，并在结论中写明。
7. **出错自修。** 代码报错时阅读错误信息、修正后重试。同一种错误不要重复超过两次，换一种方法。
8. **简洁高效。** 每步代码只做一件事，先小规模查看数据再做完整计算。

## 运行环境
- Python 内核已导入：pandas as pd, numpy as np, duckdb, plotly.express as px, plotly.graph_objects as go
- 已加载的表既是同名 DataFrame 变量，也可以在 SQL 中直接使用；sql(query) 执行 DuckDB SQL 并返回 DataFrame
- 画图：用 plotly 创建 fig，写清标题和坐标轴，然后 fig.show()
- 打印数值时保留合适的小数位（金额 2 位，比例 1-2 位百分数）
"""

PLAN = """请根据用户问题和数据情况，制定分析计划。只输出 JSON，格式如下：
{
  "understanding": "用一两句话复述你对问题的理解",
  "answerable": true,
  "reason": "如果 answerable 为 false，说明为什么现有数据无法回答",
  "assumptions": ["你做出的假设，可以为空"],
  "steps": [{"title": "步骤标题（10 字以内）", "detail": "具体做什么"}]
}
要求：steps 2-6 步；不要包含"写报告"这类步骤；如果数据明显缺少回答问题所需的信息，answerable 设为 false，steps 留空。"""

NUDGE_NO_FINDINGS = (
    "你还没有用 record_finding 登记任何结论。请把回答问题所需的关键数字登记下来"
    "（引用对应的代码单元）；如果数据确实无法回答，请直接说明原因。"
)

REPORT = """请根据以下已登记的结论，为用户写一份分析报告（Markdown）。

## 用户问题
{question}

## 已登记的结论（只能使用这些数字）
{findings}

## 可引用的图表
{figures}

## 分析过程备注
{draft}

## 写作要求
1. 结构：`## 结论` (2-4 句直接回答问题) → `## 主要发现` (分条) → `## 方法与口径` → `## 假设与局限`。
2. **报告中出现的每个数字都必须来自上面的结论**，写数字的句子末尾标注来源，如 [F2]。不得自行计算新数字（包括差值、比例、合计）。
3. 需要展示图表时，单独一行写图表编号，如 [C5]。
4. 语言简洁、专业，面向业务读者；不要复述代码。
5. 如果问题无法用数据回答，直接说明原因和需要什么数据，不要出现编造的数字。
"""

REPORT_FIX = """报告未通过数字核查：
{problems}

请修改报告：删除这些数字，或替换为已登记结论中的数字并标注来源。不要引入新数字。输出完整的修改后报告。"""


def format_profiles(profiles: dict[str, dict[str, Any]], max_cols: int = 40) -> str:
    if not profiles:
        return "（当前没有加载数据表）"
    blocks = []
    for name, p in profiles.items():
        cols = []
        for c in p["columns"][:max_cols]:
            desc = f"{c['name']} ({c['dtype']}"
            if c["nulls"]:
                desc += f", 缺失{c['nulls']}"
            if "min" in c and c.get("min") is not None:
                desc += f", 范围 {c['min']}~{c['max']}"
            elif c.get("top"):
                desc += f", 例 {'/'.join(c['top'][:2])}"
            cols.append(desc + ")")
        more = f" …另有 {len(p['columns']) - max_cols} 列" if len(p["columns"]) > max_cols else ""
        blocks.append(f"- **{name}**（{p['rows']} 行）：" + "；".join(cols) + more)
    return "\n".join(blocks)


def system_prompt(pack_prompt: str, semantic_summary: str, profiles_text: str, documents: list[str], experience_count: int) -> str:
    parts = [SYSTEM]
    if pack_prompt.strip():
        parts.append("## 领域指引\n" + pack_prompt.strip())
    parts.append("## 已加载的数据表\n" + profiles_text)
    if semantic_summary:
        parts.append("## 语义层概览\n" + semantic_summary)
    if documents:
        parts.append("## 知识库文档（用 search_knowledge 检索）\n" + "、".join(documents))
    if experience_count:
        parts.append(f"## 经验库\n有 {experience_count} 条已验证的分析经验，遇到常见问题可先用 recall_experience 查看写法。")
    return "\n\n".join(parts)


def format_findings(findings) -> str:
    if not findings:
        return "（无）"
    return "\n".join(f"- [{f.id}] {f.claim}（证据 {f.evidence_id}）" for f in findings)


def plan_to_text(plan: dict[str, Any]) -> str:
    return json.dumps(plan, ensure_ascii=False, indent=1)
