"""Regressions from a real run log (Panzhihua rainfall, qwen3.8-flash): rejected findings for
parameters and wrong cells, an errored cell with valid output, a tool-name typo, running out of steps."""

import json

from conftest import make_service, requires_data

from proven import trace as T
from proven.agent.orchestrator import _compact
from proven.sandbox.base import CellResult
from proven.testing import ScriptedChat, plan, say, tool

pytestmark = requires_data


def results(svc, run_id, name):
    return [e.data for e in svc.trace.events(run_id) if e.type == T.TOOL_RESULT and e.data["name"] == name]


async def test_finding_evidence_rules(settings):
    model = ScriptedChat(
        [
            plan(["统计"]),
            # C1 prints a value, then fails (like writing to /tmp on Windows)
            say("", tool("run_python", code="print('客户数', len(Customer))\nopen('/nonexistent/dir/x', 'w')", purpose="出错但有输出")),
            # C2 uses a threshold that only appears in the code
            say("", tool("run_python", code="print((Invoice.Total >= 10).sum())", purpose="阈值")),
            say("", tool("run_python", code="print(round(Invoice.Total.sum(), 2))", purpose="总额")),
            say(
                "",
                tool("record_funding", claim="占位", evidence="C1"),  # typo -> hint, no finding
                tool("record_finding", claim="共有 59 位客户", evidence="C1"),  # errored cell with output -> ok
                tool("record_finding", claim="金额不低于 10 美元的发票有 64 张", evidence="C2"),  # 10 from code -> ok
                tool("record_finding", claim="总销售额 2328.6 美元，客户 59 位", evidence="C3"),  # 59 in C1 -> hint
                tool("record_finding", claim="总销售额 2328.6 美元，客户 59 位", evidence="C3,C1"),  # multi -> ok
            ),
            say("完成"),
            say("共有 59 位客户 [F1]，总销售额 2,328.60 美元 [F3]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("business")
    try:
        await session.load_demo("chinook")
        run = svc.start_run(session, "客户和销售概况")
        await svc.wait(run.id)
        assert run.status == "done", svc.trace.events(run.id)[-1].data
        typo = results(svc, run.id, "record_funding")[0]
        assert not typo["ok"] and "record_finding" in typo["text"].split("可用工具")[0]
        rf = results(svc, run.id, "record_finding")
        assert [r["ok"] for r in rf] == [True, True, False, True]
        assert "59 出现在 C1" in rf[2]["text"]
        assert [f.evidence_id for f in run.findings.items] == ["C1", "C2", "C3,C1"]
        assert run.findings.items[2].evidence_type == "cell" and run.check["ok"]
    finally:
        await svc.shutdown()


async def test_step_budget_warning(settings):
    settings.max_steps = 4
    model = ScriptedChat([plan(["a"])] + [say("", tool("run_python", code="print(1)", purpose="p"))] * 4 + [say("## 结论\n无")])
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "测试")
        await svc.wait(run.id)
        assert run.status == "done"
        warned = [m for m in model.calls[2]["messages"] if m["role"] == "user" and "只剩" in m["content"]]
        assert warned and "3 步" in warned[0]["content"]
    finally:
        await svc.shutdown()


def test_compact_folds_old_code_once():
    long_code = "x = 1\n" * 200
    msgs = [{"role": "system", "content": "s"}]
    for i in range(8):
        msgs.append({"role": "assistant", "content": "", "tool_calls": [{"id": str(i), "type": "function", "function": {"name": "run_python", "arguments": json.dumps({"code": long_code, "purpose": "p"})}}]})
        msgs.append({"role": "tool", "tool_call_id": str(i), "content": "y" * 2000})
    _compact(msgs)
    first = json.loads(msgs[1]["tool_calls"][0]["function"]["arguments"])
    last = json.loads(msgs[-2]["tool_calls"][0]["function"]["arguments"])
    assert "已折叠" in first["code"] and first["purpose"] == "p" and last["code"] == long_code
    assert len(msgs[2]["content"]) < 700 and len(msgs[-1]["content"]) == 2000
    snapshot = json.dumps(msgs)
    _compact(msgs)
    assert json.dumps(msgs) == snapshot  # stable prefix: compaction is idempotent


def test_traceback_trimmed_to_user_frame():
    tb = "ValueError Traceback\nCell In[5], line 6\n----> 6 fig.update_traces(textposition='right')\nFile /site-packages/plotly/x.py:5181\n" + "internal\n" * 300
    cell = CellResult(cell_id="C5", code="", error={"name": "ValueError", "value": "bad textposition", "traceback": tb})
    text = cell.for_model(4000)
    assert "Cell In[5], line 6" in text and "internal" not in text and len(text) < 600
