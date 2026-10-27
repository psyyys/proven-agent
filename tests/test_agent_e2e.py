"""End-to-end runs with a real kernel and real data; only the model is scripted."""

import asyncio

from conftest import make_service, requires_data

from proven import trace as T
from proven.testing import ScriptedChat, plan, say, tool

pytestmark = requires_data


def event_types(svc, run_id):
    return [e.type for e in svc.trace.events(run_id)]


async def test_full_run_with_rejected_finding_and_report_fix(settings):
    model = ScriptedChat(
        [
            plan(["查看发票数据", "计算 2025 年销售额"]),
            say("先计算。", tool("query_sql", sql="SELECT ROUND(SUM(Total), 2) AS revenue FROM Invoice "
                                                   "WHERE strftime(CAST(InvoiceDate AS TIMESTAMP), '%Y') = '2025'", purpose="2025 年销售额")),
            # The model tries to record a number that is not in C1's output: must be rejected.
            say("", tool("record_finding", claim="2025 年销售额为 9,999.99 美元", evidence="C1")),
            say("", tool("record_finding", claim="2025 年销售额为 450.58 美元", evidence="C1", value=450.58)),
            say("分析完成：2025 年销售额为 450.58 美元。"),
            # First report draft invents a growth rate -> fails the check -> fixed in the second draft.
            say("## 结论\n2025 年销售额为 450.58 美元 [F1]，同比增长 12.3%。"),
            say("## 结论\n2025 年销售额为 450.58 美元 [F1]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        assert "Invoice" in session.profiles and session.semantic_datasets == {"chinook"}

        run = svc.start_run(session, "2025 年的总销售额是多少？")
        await svc.wait(run.id)

        assert run.status == "done", svc.trace.events(run.id)[-1].data
        assert [f.claim for f in run.findings.items] == ["2025 年销售额为 450.58 美元"]
        assert run.check["ok"] and "12.3" not in run.report

        events = svc.trace.events(run.id)
        rejected = [e for e in events if e.type == T.TOOL_RESULT and e.data["name"] == "record_finding" and not e.data["ok"]]
        assert rejected and "9,999.99" in rejected[0].data["text"]
        checks = [e.data for e in events if e.type == T.CHECK]
        assert [c["ok"] for c in checks] == [False, True]
        assert checks[0]["unsupported"][0]["number"] == "12.3%"
        types = event_types(svc, run.id)
        assert types[0] == T.RUN_STARTED and types[-1] == T.RUN_FINISHED
        assert T.CELL_EXECUTED in types and T.REPORT in types

        # verified runs become experiences
        svc.mark_verified(run.id)
        assert svc.experience.recall("business", "2025 年销售额是多少")
    finally:
        await svc.shutdown()


async def test_code_error_is_returned_to_model(settings):
    model = ScriptedChat(
        [
            plan(["计算"]),
            say("", tool("run_python", code="Invoice['NoSuchColumn'].sum()", purpose="错误示例")),
            lambda msgs: say("", tool("run_python", code="print(round(Invoice['Total'].sum(), 2))", purpose="修正")),
            say("", tool("record_finding", claim="总销售额为 2328.6 美元", evidence="C2")),
            say("完成"),
            say("总销售额为 2,328.60 美元 [F1]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "总销售额是多少？")
        await svc.wait(run.id)
        assert run.status == "done"
        tool_msgs = [m for m in model.calls[2]["messages"] if m["role"] == "tool"]
        assert "KeyError" in tool_msgs[-1]["content"]
        assert session.cells["C1"].ok is False and session.cells["C2"].ok
        assert run.check["ok"]
    finally:
        await svc.shutdown()


async def test_unanswerable_question_skips_execution(settings):
    model = ScriptedChat(
        [
            plan([], answerable=False, reason="数据中没有客户年龄和性别字段"),
            say("## 结论\n现有数据无法回答：Customer 表中没有年龄和性别字段。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "客户的年龄分布？")
        await svc.wait(run.id)
        assert run.status == "done" and not run.findings.items and run.check["ok"]
        assert T.CELL_EXECUTED not in event_types(svc, run.id)
    finally:
        await svc.shutdown()


async def test_plan_approval_with_edit(settings):
    model = ScriptedChat(
        [
            plan(["步骤A"]),
            lambda msgs: (say("完成") if "步骤B" in msgs[-1]["content"] else say("计划没有被修改")),
            say("无"),  # nudge response when no findings
            say("## 结论\n无"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "测试", auto_approve=False)
        for _ in range(100):
            if run.status == "awaiting_approval":
                break
            await asyncio.sleep(0.05)
        assert run.status == "awaiting_approval"
        edited = dict(run.plan, steps=[{"title": "步骤B", "detail": "用户修改"}])
        svc.approve(run.id, edited)
        await svc.wait(run.id)
        assert run.status == "done" and run.plan["steps"][0]["title"] == "步骤B"
        approved = [e for e in svc.trace.events(run.id) if e.type == T.PLAN_APPROVED][0]
        assert approved.data["edited"] is True
    finally:
        await svc.shutdown()


async def test_ask_user_pauses_run(settings):
    model = ScriptedChat([plan(["澄清"]), say("", tool("ask_user", question="按哪个时间口径？", options=["开票日期", "付款日期"]))])
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "月度销售额")
        await svc.wait(run.id)
        assert run.status == "needs_input"
        assert any(e.type == T.ASK_USER for e in svc.trace.events(run.id))
        assert "按哪个时间口径" in session.history[-1]["content"] and session.history[-2]["content"] == "月度销售额"
    finally:
        await svc.shutdown()
