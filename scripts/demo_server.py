"""Offline UI demo: the real backend, kernel, data and checks, but the model replies come from a fixed
script (one Chinook question). Useful for trying the interface and taking screenshots without an API key.

    python scripts/demo_server.py           # then open http://127.0.0.1:8000 and ask anything in the business pack
    python scripts/demo_server.py --multi   # the same analysis in multi-agent mode
"""

from __future__ import annotations

import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from proven.api.app import create_app  # noqa: E402
from proven.config import Settings  # noqa: E402
from proven.service import Service  # noqa: E402
from proven.testing import ScriptedChat, say, tool  # noqa: E402

SQL = """SELECT c.Country,
       ROUND(SUM(i.Total), 2) AS revenue,
       ROUND(100 * SUM(i.Total) / (SELECT SUM(Total) FROM Invoice), 2) AS share_pct
FROM Invoice i
JOIN Customer c ON i.CustomerId = c.CustomerId
GROUP BY c.Country
ORDER BY revenue DESC
LIMIT 5"""

CHART = """top5 = result
print(f"前 5 名合计占比：{top5.share_pct.sum():.2f}%")
print(f"有销售的国家数：{Invoice.merge(Customer, on='CustomerId').Country.nunique()}")
fig = px.bar(top5, x="Country", y="revenue", text="share_pct", title="收入前 5 名国家（美元）",
             labels={"Country": "国家", "revenue": "收入（美元）"})
fig.update_traces(texttemplate="%{text}%", textposition="outside")
fig.show()"""

PLAN = """{"understanding": "按客户所在国家汇总发票金额，找出收入最高的国家，并计算前 5 名各自占总收入的比例。",
"answerable": true, "reason": "", "assumptions": ["收入按发票口径 SUM(Invoice.Total) 计算", "国家取客户主数据中的 Country 字段"],
"steps": [{"title": "确认口径", "detail": "查询语义层中销售额的定义"},
          {"title": "按国家汇总", "detail": "Invoice 关联 Customer，按国家汇总收入并计算占比"},
          {"title": "可视化", "detail": "画出前 5 名国家的收入柱状图"},
          {"title": "登记结论", "detail": "登记最高国家与前 5 名占比"}]}"""


def script() -> list:
    return [
        say(PLAN),
        say("先确认销售额的口径。", tool("lookup_semantic", query="销售额")),
        say("按语义层定义，用发票口径按国家汇总。", tool("query_sql", sql=SQL, purpose="按国家汇总收入及占比（前 5 名）")),
        say("", tool("run_python", code=CHART, purpose="计算前 5 名合计占比并画图")),
        say("", tool("record_finding", claim="美国客户贡献的收入最多，为 523.06 美元，占总收入的 25.1%", evidence="C1")),
        say("占比写错了，按 C1 的输出更正。", tool("record_finding", claim="美国客户贡献的收入最多，为 523.06 美元，占总收入的 22.46%", evidence="C1", value=523.06)),
        say("", tool("record_finding", claim="收入前 5 名依次为美国 523.06、加拿大 303.96、法国 195.1、巴西 190.1、德国 156.48 美元，占比分别为 22.46%、13.05%、8.38%、8.16%、6.72%", evidence="C1")),
        say("", tool("record_finding", claim="前 5 名国家合计占总收入的 58.77%，共有 24 个国家产生过销售", evidence="C2")),
        say("分析完成：美国收入最高（523.06 美元，22.46%），前 5 名合计 58.77%。"),
        say(
            "## 结论\n美国是收入最高的市场，贡献 523.06 美元，占总收入的 22.46% [F1]。第二名加拿大的收入约为美国的 58%。\n\n"
            "## 主要发现\n- 前 5 名依次为美国、加拿大、法国、巴西、德国 [F2]\n\n[C2]\n"
        ),
        say(
            "## 结论\n美国是收入最高的市场，贡献 523.06 美元，占总收入的 22.46% [F1]。前 5 名国家合计贡献 58.77% 的收入，"
            "收入集中度较高 [F3]。\n\n"
            "## 主要发现\n"
            "- 前 5 名依次为美国（523.06 美元，22.46%）、加拿大（303.96 美元，13.05%）、法国（195.1 美元，8.38%）、"
            "巴西（190.1 美元，8.16%）、德国（156.48 美元，6.72%）[F2]\n"
            "- 共有 24 个国家产生过销售，收入高度集中在前 5 名 [F3]\n\n[C2]\n\n"
            "## 方法与口径\n收入按语义层定义的发票口径计算（SUM(Invoice.Total)），国家取客户主数据 Customer.Country。\n\n"
            "## 假设与局限\n- 国家按客户注册地址统计，与账单国家（BillingCountry）可能存在差异\n- 数据期间为 2021-2025 年全部发票，未区分年度变化"
        ),
    ]


MULTI_PLAN = """{"understanding": "按客户所在国家汇总发票金额，找出收入最高的国家，并计算前 5 名占比。",
"answerable": true, "reason": "", "assumptions": ["收入按发票口径 SUM(Invoice.Total) 计算"],
"steps": [{"title": "按国家汇总", "detail": "确认口径后，按国家汇总收入并计算占比", "deliverable": "收入最高的国家及前 5 名占比"},
          {"title": "集中度与可视化", "detail": "计算前 5 名合计占比并画图", "deliverable": "前 5 名合计占比"}]}"""


def multi_script() -> list:
    return [
        say(MULTI_PLAN),
        # analyst 1
        say("先确认销售额口径。", tool("lookup_semantic", query="销售额")),
        say("", tool("query_sql", sql=SQL, purpose="按国家汇总收入及占比（前 5 名）")),
        say("", tool("record_finding", claim="美国客户贡献的收入最多，为 523.06 美元，占总收入的 22.46%", evidence="C1", value=523.06)),
        say("", tool("record_finding", claim="收入前 5 名依次为美国 523.06、加拿大 303.96、法国 195.1、巴西 190.1、德国 156.48 美元，占比分别为 22.46%、13.05%、8.38%、8.16%、6.72%", evidence="C1")),
        say("", tool("submit_step", status="done", summary="按发票口径汇总，美国收入最高（523.06 美元，22.46%）。前 5 名结果保存在 result。", variables=["result"])),
        # analyst 2
        say("直接使用上一步留下的 result。", tool("run_python", code=CHART, purpose="计算前 5 名合计占比并画图")),
        say("", tool("record_finding", claim="前 5 名国家合计占总收入的 58.77%，共有 24 个国家产生过销售", evidence="C2")),
        say("", tool("submit_step", status="done", summary="前 5 名合计占 58.77%，收入集中度较高；已生成柱状图 C2。")),
        say(
            "## 结论\n美国是收入最高的市场，贡献 523.06 美元，占总收入的 22.46% [F1]。前 5 名国家合计贡献 58.77% 的收入 [F3]。\n\n"
            "## 主要发现\n- 前 5 名依次为美国、加拿大、法国、巴西、德国 [F2]\n\n[C2]\n\n"
            "## 方法与口径\n收入按语义层定义的发票口径计算。"
        ),
    ]


class DemoChat(ScriptedChat):
    model = "演示模式（预设脚本）"

    async def chat(self, messages, tools=None, json_mode=False):
        if not self.script:  # replay the same scripted analysis for every new question
            self.script = multi_script() if MULTI else script()
        return await super().chat(messages, tools, json_mode)


MULTI = "--multi" in sys.argv


def main() -> None:
    settings = Settings.from_env()
    if MULTI:
        settings.mode = "multi"
    settings.llm_api_key = settings.llm_api_key or "demo"
    settings.llm_model = DemoChat.model
    service = Service(settings, model_factory=lambda: DemoChat(multi_script() if MULTI else script()), use_default_embedder=False)
    ports = [a for a in sys.argv[1:] if a.isdigit()]
    uvicorn.run(create_app(service), host="127.0.0.1", port=int(ports[0]) if ports else 8000)


if __name__ == "__main__":
    main()
