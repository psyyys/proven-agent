"""Multi mode: one fresh-context analyst per plan step, structured handoff, shared kernel."""

import json

from conftest import make_service, requires_data

from proven import trace as T
from proven.testing import ScriptedChat, plan, say, tool
from proven.trace_export import run_to_markdown

pytestmark = requires_data


def last_user(messages):
    return [m for m in messages if m["role"] == "user"][-1]["content"]


async def test_two_analysts_hand_off_through_kernel_and_summary(settings):
    step1_code = "yearly = Invoice.assign(y=pd.to_datetime(Invoice.InvoiceDate).dt.year).groupby('y').Total.sum().round(2)\nprint(yearly)"

    def analyst2_first_turn(messages):
        handoff = last_user(messages)
        # fresh context: only system + handoff card, no earlier code or tool results
        assert [m["role"] for m in messages] == ["system", "user"]
        assert "第 2 步" in handoff and "年度汇总" in handoff
        assert "[F1] 2025 年销售额为 450.58 美元" in handoff  # previous finding handed over
        assert "`yearly`：Series" in handoff  # kernel variable handed over
        assert step1_code not in json.dumps(messages, ensure_ascii=False)
        return say("", tool("run_python", code="print(round((yearly[2025] - yearly[2024]) / yearly[2024] * 100, 2))", purpose="同比"))

    model = ScriptedChat(
        [
            plan(["年度汇总", "同比增长"]),
            # analyst 1
            say("", tool("run_python", code=step1_code, purpose="按年汇总")),
            say("", tool("record_finding", claim="2025 年销售额为 450.58 美元", evidence="C1")),
            say("", tool("submit_step", status="done", summary="已按年汇总销售额，2025 年为 450.58 美元。", variables=["yearly"])),
            # analyst 2
            analyst2_first_turn,
            say("", tool("record_finding", claim="2025 年销售额同比下降 5.64%", evidence="C2")),
            say("", tool("submit_step", status="done", summary="2025 年同比下降 5.64%。")),
            # writer
            say("## 结论\n2025 年销售额为 450.58 美元 [F1]，同比下降 5.64% [F2]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "2025 年销售额和同比变化", mode="multi")
        await svc.wait(run.id)
        assert run.status == "done", svc.trace.events(run.id)[-1].data
        assert run.mode == "multi" and run.check["ok"]

        events = svc.trace.events(run.id)
        started = [e.data for e in events if e.type == T.STEP_STARTED]
        finished = [e.data for e in events if e.type == T.STEP_FINISHED]
        assert [(s["task"], s["title"]) for s in started] == [(1, "年度汇总"), (2, "同比增长")]
        assert [(f["task"], f["status"], f["findings"]) for f in finished] == [(1, "done", ["F1"]), (2, "done", ["F2"])]
        assert finished[0]["variables"] == ["yearly"] and finished[0]["usage"]["llm_calls"] == 3
        # every tool event inside a step is tagged with its step
        assert all(e.data.get("task") in (1, 2) for e in events if e.type in (T.TOOL_CALL, T.TOOL_RESULT, T.CELL_EXECUTED))

        # the writer gets the analysts' summaries as its draft
        report_prompt = last_user(model.calls[-1]["messages"])
        assert "第 1 步 年度汇总（完成）" in report_prompt and "第 2 步 同比增长（完成）" in report_prompt

        md = run_to_markdown(svc.trace, run.id)
        assert "模式：multi" in md and "## 第 2/2 步：同比增长" in md and "各步骤用量" in md
    finally:
        await svc.shutdown()


async def test_submit_requires_findings_and_budget_overrun_continues(settings):
    settings.step_budget = 3
    model = ScriptedChat(
        [
            plan(["第一步", "第二步"]),
            # analyst 1: submits without findings -> rejected, then never submits; budget runs out
            say("", tool("submit_step", status="done", summary="完成")),
            say("", tool("run_python", code="print(len(Customer))", purpose="计数")),
            say("", tool("record_finding", claim="共有 59 位客户", evidence="C1")),
            # analyst 2: answers without tools twice (nudged once), accepted as its summary
            say("看起来没什么可算的"),
            say("第二步无需计算。"),
            say("## 结论\n共有 59 位客户 [F1]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "客户数", mode="multi")
        await svc.wait(run.id)
        assert run.status == "done"
        events = svc.trace.events(run.id)
        rejected = [e.data for e in events if e.type == T.TOOL_RESULT and e.data["name"] == "submit_step"]
        assert rejected and not rejected[0]["ok"] and "还没有登记" in rejected[0]["text"]
        finished = [e.data for e in events if e.type == T.STEP_FINISHED]
        assert finished[0]["outcome"] == "budget" and finished[0]["status"] == "partial" and finished[0]["findings"] == ["F1"]
        assert finished[1]["outcome"] == "answered" and finished[1]["summary"] == "第二步无需计算。"
        # the low-budget reminder was given to analyst 1
        assert any("只剩" in m["content"] for m in model.calls[3]["messages"] if m["role"] == "user")
    finally:
        await svc.shutdown()


async def test_large_output_is_spilled_to_file(settings):
    settings.tool_output_chars = 300
    model = ScriptedChat(
        [
            plan(["打印"]),
            say("", tool("run_python", code="print(Track[['TrackId', 'Name']].head(80).to_string())", purpose="大输出")),
            say("完成"),
            say("完成"),
            say("## 结论\n无"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "打印曲目", mode="single")
        await svc.wait(run.id)
        result = [e.data for e in svc.trace.events(run.id) if e.type == T.TOOL_RESULT][0]
        assert result["data"]["spilled"] == "outputs/C1.txt" and "已保存到 outputs/C1.txt" in result["text"]
        saved = (session.dir / "outputs" / "C1.txt").read_text(encoding="utf-8")
        assert len(saved) > 300 and "TrackId" in saved
        # readable from the kernel with a relative path
        r = await session.executor.run("print(len(open('outputs/C1.txt', encoding='utf-8').read()) > 300)", record=False)
        assert r.stdout.strip() == "True"
    finally:
        await svc.shutdown()


async def test_kernel_variables_exclude_tables_and_helpers(settings):
    svc = make_service(settings, ScriptedChat([]))
    session = await svc.create_session("water")
    try:
        await session.load_demo("usgs_peaks")
        assert await session.kernel_variables() == []
        await session.executor.run("am = annual_maxima(usgs_peaks_01594440, 'peak_date', 'peak_cfs', 10)\nn = len(am)\n_tmp = 1")
        names = {v["name"]: v["desc"] for v in await session.kernel_variables()}
        assert set(names) == {"am", "n"} and names["am"].startswith("DataFrame 20×3") and names["n"] == "int = 20"
    finally:
        await svc.shutdown()
