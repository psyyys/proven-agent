"""Phase 2 reviewer: domain rules, model review, one redo, and replaced findings."""

import json

import pytest
from conftest import make_service

from proven import trace as T
from proven.findings import FindingRegistry, check_report
from proven.packs import discover_packs
from proven.review_eval import run_review_eval
from proven.rules import Evidence, RuleError, parse_rules
from proven.testing import ScriptedChat, plan, say, tool


def last_user(messages):
    return [m for m in messages if m["role"] == "user"][-1]["content"]


def reviewer(issues, check=None):
    def reply(messages):
        if check:
            check(last_user(messages))
        return say(json.dumps({"issues": issues}, ensure_ascii=False))

    return reply


async def test_multi_rule_error_sends_step_back_and_finding_is_replaced(settings):
    settings.review = "full"

    def first_review(prompt):
        assert "[F1] 流域 A 的径流系数为 1.32" in prompt and "print(round(1.32, 2))" in prompt
        assert "[W001 · 错误]" in prompt  # rule issues are shown so the model does not repeat them
        assert "单位换算" in prompt  # the pack's review points

    def redo_turn(messages):
        text = last_user(messages)
        assert "审核员退回了本步结果" in text and "W001" in text and "replaces" in text
        assert "[审核员 · 警告] F1" in text and "写明年份" in text
        # the same analyst continues: its earlier code is still in the conversation
        assert "print(round(1.32, 2))" in json.dumps(messages, ensure_ascii=False)
        return say("", tool("run_python", code="print(round(0.66, 2))", purpose="重新计算"))

    model = ScriptedChat(
        [
            plan(["径流系数"]),
            say("", tool("run_python", code="print(round(1.32, 2))", purpose="径流系数")),
            say("", tool("record_finding", claim="流域 A 的径流系数为 1.32", evidence="C1")),
            say("", tool("submit_step", status="done", summary="径流系数为 1.32。")),
            reviewer([{"finding": "F1", "severity": "warning", "problem": "没有说明计算时段", "suggestion": "写明年份"},
                      {"finding": "F9", "severity": "error", "problem": "不在本步的结论，应被忽略"}], first_review),
            redo_turn,
            say("", tool("record_finding", claim="流域 A 2001 年的径流系数为 0.66", evidence="C2", replaces="F1")),
            say("", tool("submit_step", status="done", summary="单位换算后径流系数为 0.66。", notes="已修正单位")),
            reviewer([]),
            say("## 结论\n流域 A 2001 年的径流系数为 0.66 [F2]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("water")
    try:
        run = svc.start_run(session, "流域 A 的径流系数", mode="multi")
        await svc.wait(run.id)
        assert run.status == "done", svc.trace.events(run.id)[-1].data
        f1, f2 = run.findings.items
        assert (f1.status, f1.replaced_by, f2.status) == ("retracted", "F2", "active")

        events = svc.trace.events(run.id)
        reviews = [e.data for e in events if e.type == T.REVIEW]
        assert [(r["round"], r["action"], r["errors"], r["task"]) for r in reviews] == [(1, "redo", 1, 1), (2, "final", 0, 1)]
        assert {i["rule_id"] or i["source"] for i in reviews[0]["issues"]} == {"W001", "llm"}
        assert [e.data["id"] for e in events if e.type == T.FINDING_RETRACTED] == ["F1"]
        finished = [e.data for e in events if e.type == T.STEP_FINISHED][0]
        assert finished["findings"] == ["F2"] and finished["review"]["redone"] and finished["notes"] == "已修正单位"
        assert finished["usage"]["llm_calls"] == 8  # analyst 3 + review + redo 3 + review

        # the writer sees only the corrected finding, and no open review issues
        report_prompt = last_user(model.calls[-1]["messages"])
        assert "[F2] 流域 A 2001 年的径流系数为 0.66" in report_prompt and "1.32" not in report_prompt
        assert run.issues == [] and run.check["ok"]
        assert [e.data for e in events if e.type == T.REPORT][0]["findings"][0]["status"] == "retracted"
    finally:
        await svc.shutdown()


async def test_single_mode_redo_then_warning_goes_to_report(settings):
    model = ScriptedChat(
        [
            plan(["趋势检验", "推算"]),
            say("", tool("run_python", code="print('p=0.27')\nprint(1483)", purpose="检验")),
            say("", tool("record_finding", claim="年降水呈显著上升趋势", evidence="C1")),
            say("", tool("record_finding", claim="预测 2026 年降水为 1483 mm", evidence="C1")),
            say("分析完成。"),
            # G002 (error) sends it back once; G004 (warning) does not
            lambda messages: (
                ("G002" in last_user(messages) and "G004" in last_user(messages))
                or pytest.fail("redo message should list both issues")
            )
            and say("", tool("record_finding", claim="年降水有上升倾向，但不显著（p=0.27）", evidence="C1", replaces="F1")),
            say("已按审核意见修正。"),
            say("## 结论\n年降水有上升倾向但不显著（p=0.27）[F3]；2026 年降水的统计情景约为 1483 mm [F2]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "降水趋势和明年降水", mode="single")
        await svc.wait(run.id)
        assert run.status == "done", svc.trace.events(run.id)[-1].data
        assert [(f.id, f.status) for f in run.findings.items] == [("F1", "retracted"), ("F2", "active"), ("F3", "active")]
        reviews = [e.data for e in svc.trace.events(run.id) if e.type == T.REVIEW]
        assert [(r["action"], r["errors"], r["warnings"], r["model"]) for r in reviews] == [("redo", 1, 1, False), ("final", 0, 1, False)]
        assert [(i.rule_id, i.finding_id) for i in run.issues] == [("G004", "F2")]

        report_prompt = last_user(model.calls[-1]["messages"])
        assert "[G004 · 警告] F2「预测 2026 年降水为 1483 mm」" in report_prompt
        assert "审核后的修正：已按审核意见修正。" in report_prompt and "年降水呈显著上升趋势" not in report_prompt
        assert run.check["ok"]
    finally:
        await svc.shutdown()


async def test_model_review_failure_keeps_rule_results(settings):
    settings.review = "full"
    model = ScriptedChat(
        [
            plan(["计算"]),
            say("", tool("run_python", code="print(0.42)", purpose="相关")),
            say("", tool("record_finding", claim="两者强相关（r = 0.42）", evidence="C1")),
            say("完成"),
            say("这不是 JSON"),  # reviewer reply cannot be parsed: no model issues, the run goes on
            say("## 结论\n两者相关（r = 0.42）[F1]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "相关性", mode="single")
        await svc.wait(run.id)
        assert run.status == "done"
        review = [e.data for e in svc.trace.events(run.id) if e.type == T.REVIEW][0]
        assert review["model"] and review["action"] == "accept" and [i["rule_id"] for i in review["issues"]] == ["G003"]
        assert model.calls[4]["json_mode"]
    finally:
        await svc.shutdown()


async def test_review_off_makes_no_extra_calls(settings):
    settings.review = "off"
    model = ScriptedChat(
        [
            plan(["计算"]),
            say("", tool("run_python", code="print(1.5)", purpose="x")),
            say("", tool("record_finding", claim="相关系数为 1.5", evidence="C1")),
            say("完成"),
            say("## 结论\n相关系数为 1.5 [F1]。"),
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "x", mode="single")
        await svc.wait(run.id)
        assert run.status == "done" and not any(e.type == T.REVIEW for e in svc.trace.events(run.id))
    finally:
        await svc.shutdown()


def test_retracted_findings_cannot_be_cited():
    reg = FindingRegistry()
    reg.add("径流系数为 1.32", "cell", "C1", None)
    reg.add("径流系数为 0.66", "cell", "C2", None)
    reg.retract("F1", by="F2")
    check = check_report("径流系数为 1.32 [F1]，修正后为 0.66 [F2]。", reg)
    assert check.unknown_citations == ["F1"] and [u["number"] for u in check.unsupported] == ["1.32"]


@pytest.mark.parametrize("pack", ["water", "business", "finance"])
async def test_trap_cases_pass_with_rules(pack):
    report = await run_review_eval(discover_packs()[pack])
    failed = [(r["id"], r["expect"], r["fired"]) for r in report["results"] if not r["passed"]]
    assert not failed
    assert report["summary"]["false_positive_cases"] == 0


def test_rule_file_errors_are_explained():
    with pytest.raises(RuleError, match="不认识的字段"):
        parse_rules("rules:\n  - {id: X1, name: n, applies_when: [a], check: {maxx: 1}, message: m}")
    with pytest.raises(RuleError, match="未知的 fact"):
        parse_rules("rules:\n  - {id: X1, name: n, applies_when: [a], check: {fact: nope}, message: m}")
    with pytest.raises(RuleError, match="缺少字段 message"):
        parse_rules("rules:\n  - {id: X1, name: n, applies_when: [a], check: {max: 1}}")


def test_custom_labelled_fact():
    rules, _ = parse_rules(
        "rules:\n  - id: X1\n    name: 干旱指数为正\n    applies_when: [干旱]\n    severity: error\n"
        "    check: {fact: {labels: [干旱指数, aridity]}, min: 0, in: [claim, evidence]}\n    message: 干旱指数应为正"
    )
    from proven.rules import RuleSet

    rs = RuleSet(rules)
    assert [i.detail for i in rs.check("F1", Evidence(claim="该流域偏干旱", evidence="aridity: -0.3"))] == ["干旱指数为 -0.3，要求不小于 0"]
    assert rs.check("F1", Evidence(claim="该流域偏干旱，干旱指数为 1.8")) == []
