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
- 变量在步骤之间一直保留，不需要把中间结果存成文件；如确需写文件，只用相对路径（如 `out.csv`），不要用 /tmp 等绝对路径（可能运行在 Windows 上）
- plotly 用 `fig.update_layout(...)` 设置标题和坐标轴；`textposition` 只能取 "top center"、"middle right" 这类组合值
- 中文字符串里需要撇号时用双引号包裹，避免 `'Sen's'` 这类语法错误

## 登记结论的技巧
- 一条结论只写一个主题，包含 1-5 个关键数字；内容很多时拆成几条分别登记
- 结论中的数字可以来自所引用单元的输出或代码中的参数（如阈值 50 mm）；跨多个单元时用逗号同时引用，如 evidence="C6,C8"；结合方法文档时可写 "C11,D8"
"""

STEPS_LOW = (
    "提醒：只剩 {remaining} 步。请优先用 record_finding 登记还没登记的关键结论，"
    "然后停止调用工具，用一段话总结。不要再开始新的分析。"
)

PLAN = """请根据用户问题和数据情况，制定分析计划。只输出 JSON，格式如下：
{
  "understanding": "用一两句话复述你对问题的理解",
  "answerable": true,
  "reason": "如果 answerable 为 false，说明为什么现有数据无法回答",
  "assumptions": ["你做出的假设，可以为空"],
  "steps": [{"title": "步骤标题（10 字以内）", "detail": "具体做什么", "deliverable": "这一步要登记哪些结论（可选）"}]
}
要求：steps 2-6 步，每一步应能独立完成并产出可登记的结论；不要包含"写报告"这类步骤；如果数据明显缺少回答问题所需的信息，answerable 设为 false，steps 留空。"""

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

## 审核意见
{review}

## 写作要求
1. 结构：`## 结论` (2-4 句直接回答问题) → `## 主要发现` (分条) → `## 方法与口径` → `## 假设与局限`。
2. **报告中出现的每个数字都必须来自上面的结论**，写数字的句子末尾标注来源，如 [F2]。不得自行计算新数字（包括差值、比例、合计）。
3. 需要展示图表时，单独一行写图表编号，如 [C5]。
4. 语言简洁、专业，面向业务读者；不要复述代码。主要发现 4-8 条，全文一般不超过 2000 字。
5. 如果问题无法用数据回答，直接说明原因和需要什么数据，不要出现编造的数字。
6. 审核意见中的每一条都要在"假设与局限"中体现（用读者能懂的话说明影响）；标为"未解决的错误"的结论不能当作确定结论写进"结论"部分。
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
    findings = [f for f in findings if getattr(f, "status", "active") == "active"]
    if not findings:
        return "（无）"
    return "\n".join(f"- [{f.id}] {f.claim}（证据 {f.evidence_id}）" for f in findings)


def plan_to_text(plan: dict[str, Any]) -> str:
    return json.dumps(plan, ensure_ascii=False, indent=1)


ANALYST_ROLE = """## 你的角色：分析员
你只负责分析计划中的**一个步骤**。前面的步骤由其他分析员完成，你只能看到他们的总结、登记的结论和留在内核里的变量；
你的代码和对话后续步骤也看不到。
- 直接使用内核里已有的变量，不要重复前面步骤已经做过的计算
- 只做本步骤的事，不要提前做后面的步骤
- 关键数字用 record_finding 登记
- 完成后调用 submit_step 提交：两三句话总结、后续要用的变量名
"""

HANDOFF = """用户问题：{question}

## 整体计划
{plan_overview}

## 你负责：第 {index} 步 · {title}
{detail}{deliverable}

## 前面步骤的交接
{previous}

## 内核中已有的变量（可以直接使用）
{variables}

本步最多调用工具 {budget} 轮。完成后调用 submit_step。"""

STEPS_LOW_ANALYST = "提醒：本步只剩 {remaining} 轮。请登记还没登记的关键结论，然后调用 submit_step 提交总结，不要再开始新的计算。"

STEP_NUDGE = "你还没有调用 submit_step。请登记本步的关键结论，然后调用 submit_step 提交总结。"


def handoff(question: str, plan: dict[str, Any], index: int, previous: list[dict[str, Any]], findings, variables, budget: int) -> str:
    steps = plan.get("steps", [])
    step = steps[index - 1]
    overview = "\n".join(f"{'→ ' if i == index else '  '}{i}. {s.get('title', '')}" for i, s in enumerate(steps, 1))
    by_id = {f.id: f for f in findings if getattr(f, "status", "active") == "active"}
    prev_lines = []
    for p in previous:
        prev_lines.append(f"- 第 {p['index']} 步 {p['title']}（{_STATUS.get(p['status'], p['status'])}）：{p['summary']}")
        for fid in p["findings"]:
            if fid in by_id:
                prev_lines.append(f"    [{fid}] {by_id[fid].claim}")
        if p.get("notes"):
            prev_lines.append(f"    提醒：{p['notes']}")
    var_lines = [f"- `{v['name']}`：{v['desc']}" for v in variables]
    deliverable = f"\n本步需要交付：{step['deliverable']}" if step.get("deliverable") else ""
    return HANDOFF.format(
        question=question,
        plan_overview=overview,
        index=index,
        title=step.get("title", ""),
        detail=step.get("detail", ""),
        deliverable=deliverable,
        previous="\n".join(prev_lines) or "（这是第一步）",
        variables="\n".join(var_lines) or "（只有已加载的数据表）",
        budget=budget,
    )


_STATUS = {"done": "完成", "partial": "部分完成", "blocked": "未能完成"}


def step_digest(results: list[dict[str, Any]]) -> str:
    """Analyst summaries, used as the draft for the report writer."""
    return "\n".join(f"第 {r['index']} 步 {r['title']}（{_STATUS.get(r['status'], r['status'])}）：{r['summary']}" for r in results)


# ---------------------------------------------------------------------- reviewer (phase 2)

REVIEWER_SYSTEM = "你是严谨的数据分析审核员，熟悉统计方法和领域规范。只输出 JSON。"

REVIEW = """你是审核员。分析员完成了分析工作，你要检查登记的结论在方法和表述上是否站得住。
你看不到分析员的对话，只能看到结论、产生它的代码和输出。结论中的数字是否来自代码输出，程序已经核对过，不需要再核对数字是否抄对。

## 用户问题
{question}

## 审核范围
{task}

## 待审核的结论
{findings}

## 程序规则检查已发现的问题（不要重复提出）
{rule_issues}

## 检查要点
1. 方法和口径是否正确：筛选条件、时段、单位、分母，是否与语义层的指标定义一致
2. 代码是否有会让数字本身出错的问题：多表关联导致重复计数、单位没有换算、缺失值处理不当
3. 结论是否超出证据能支持的范围：把相关写成因果、把统计平均写成预测、外推过远、以偏概全
{points}

只输出 JSON，格式：
{{"issues": [{{"finding": "F3", "severity": "error", "problem": "问题是什么（一两句话）", "suggestion": "怎么改"}}]}}
- error：结论错误或会严重误导读者，必须重做
- warning：结论基本成立，但需要补充说明或加限定条件
- 没有问题时输出 {{"issues": []}}。不要为了挑错而挑错；拿不准的问题最多标 warning。"""

REVIEW_REDO = """审核员退回了本步结果，需要处理以下问题：
{issues}

处理方式：
- 结论有错的：修正代码重新计算，用 record_finding 登记更正后的结论，并用 replaces 参数指明替换哪条旧结论（如 replaces="F3"）
- 结论没错、只是缺少说明的（如样本长度、选样方式、方法、不确定性）：把说明写进结论重新登记，同样用 replaces 替换旧结论
- 你认为审核意见不成立的：不用修改，在 submit_step 的 notes 中写明理由
完成后再次调用 submit_step。本轮最多调用工具 {budget} 轮。"""

REVIEW_REDO_SINGLE = REVIEW_REDO.replace("在 submit_step 的 notes 中写明理由", "在最后的总结中写明理由").replace(
    "完成后再次调用 submit_step。", "完成后不再调用工具，用一段话总结修正情况。"
)

SEVERITY = {"error": "错误", "warning": "警告"}


def format_issue(issue, findings=None) -> str:
    """One line per issue, for the analyst (redo) and for the report writer."""
    who = issue.rule_id or "审核员"
    claim = ""
    if findings is not None:
        f = findings.get(issue.finding_id)
        claim = f"「{f.claim}」" if f else ""
    text = f"- [{who} · {SEVERITY.get(issue.severity, issue.severity)}] {issue.finding_id}{claim}："
    text += "；".join(x for x in (issue.detail, issue.message) if x)
    if issue.suggestion:
        text += f" 建议：{issue.suggestion}"
    if issue.basis:
        text += f"（依据：{issue.basis}）"
    return text


def format_review_for_report(issues, findings) -> str:
    if not issues:
        return "（无）"
    lines = []
    for i in issues:
        line = format_issue(i, findings)
        if i.severity == "error":
            line = line.replace("· 错误]", "· 未解决的错误]", 1)
        lines.append(line)
    return "\n".join(lines)
