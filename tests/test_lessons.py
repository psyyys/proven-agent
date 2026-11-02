"""Phase 3 reflector: failures -> lessons -> later prompts -> credit, and the evolution experiment."""

import json

import pytest
from conftest import make_service, requires_data

from proven import trace as T
from proven.agent.reflector import parse_lessons
from proven.evals import Question
from proven.evolve import run_evolution, split_questions
from proven.lessons import LessonStore, signature_matches
from proven.testing import ScriptedChat, plan, say, tool

PLOT_LESSON = {"text": "plotly 设置标题和坐标轴用 fig.update_layout()，Figure 没有 add_layout 方法", "when": "用 plotly 画图时",
               "scope": "all", "from": [1], "reinforces": None}


def last_user(messages):
    return [m for m in messages if m["role"] == "user"][-1]["content"]


async def test_failures_become_a_lesson_that_later_runs_use_and_credit(settings):
    settings.lessons = "learn"

    def reflector(messages):
        prompt = last_user(messages)
        assert messages[0]["content"].startswith("你是反思员")
        assert "[1] 代码报错\nAttributeError" in prompt and "add_layout" in prompt
        assert "后来成功的做法" in prompt and "update_layout" in prompt  # the fix is shown with the error
        assert "结论登记被拒" in prompt and "随后登记成功：结果为 42.5" in prompt
        assert "报告核查不通过" in prompt and "77.7" in prompt
        leaky = {"text": "这类问题的结果是 42.5，直接登记即可", "when": "", "scope": "pack", "from": [2]}
        return say(json.dumps({"lessons": [PLOT_LESSON, leaky]}, ensure_ascii=False))

    model = ScriptedChat(
        [
            plan(["画图"]),
            say("", tool("run_python", code="import plotly.graph_objects as go\nfig = go.Figure()\nfig.add_layout(title='x')", purpose="画图")),
            say("", tool("run_python", code="fig.update_layout(title='x')\nprint(42.5)", purpose="改用 update_layout")),
            say("", tool("record_finding", claim="结果为 99.9", evidence="C2")),
            say("", tool("record_finding", claim="结果为 42.5", evidence="C2")),
            say("完成"),
            say("## 结论\n结果为 42.5 [F1]，另有 77.7。"),
            say("## 结论\n结果为 42.5 [F1]。"),
            reflector,
        ]
    )
    svc = make_service(settings, model)
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "画一张图", mode="single")
        await svc.wait(run.id)
        assert run.status == "done", svc.trace.events(run.id)[-1].data
        (lesson,) = svc.lessons.all("general")
        assert lesson.scope == "all" and lesson.category == "code" and lesson.source_runs == [run.id]
        assert lesson.signatures and lesson.signatures[0].startswith("code:AttributeError:")
        ref = [e.data for e in svc.trace.events(run.id) if e.type == T.REFLECTION][0]
        assert [x["label"] for x in ref["added"]] == ["L1"] and len(ref["skipped"]) == 1  # the one with 42.5 is dropped
        assert {f["kind"] for f in ref["failures"]} == {"code", "evidence", "report"}
        assert svc.trace.events(run.id)[-1].type == T.RUN_FINISHED  # reflection happens before the run finishes
    finally:
        await svc.shutdown()

    # A later run in another pack: the lesson (scope "all") is in every analyst's prompt, and is credited
    model2 = ScriptedChat(
        [
            plan(["计数"]),
            say("", tool("run_python", code="print(round(12.5, 1))", purpose="计算")),
            say("", tool("record_finding", claim="结果为 12.5", evidence="C1")),
            say("", tool("submit_step", status="done", summary="结果为 12.5")),
            say("## 结论\n结果为 12.5 [F1]。"),
        ]
    )
    svc2 = make_service(settings, model2)
    session2 = await svc2.create_session("business")
    try:
        run2 = svc2.start_run(session2, "计数", mode="multi")
        await svc2.wait(run2.id)
        assert run2.status == "done"
        analyst_system = model2.calls[1]["messages"][0]["content"]
        assert "## 以往运行总结的教训" in analyst_system and "[L1] 用 plotly 画图时：plotly 设置标题" in analyst_system
        assert run2.lesson_ids == [1]
        events = svc2.trace.events(run2.id)
        assert [x["label"] for x in [e.data for e in events if e.type == T.LESSONS_INJECTED][0]["lessons"]] == ["L1"]
        # no failures this time: credited without any model call
        ref = [e.data for e in events if e.type == T.REFLECTION][0]
        assert ref["credited"] == {"1": "helped"} and ref["added"] == [] and len(model2.calls) == 5
        x = svc2.lessons.get(1)
        assert (x.uses, x.helped, x.failed_after) == (1, 1, 0)
    finally:
        await svc2.shutdown()


async def test_use_mode_reads_lessons_but_learns_nothing(settings):
    settings.lessons = "use"
    model = ScriptedChat(
        [
            plan(["计算"]),
            say("", tool("run_python", code="1/0", purpose="出错")),
            say("完成"),
            say("完成"),
            say("## 结论\n无"),
        ]
    )
    svc = make_service(settings, model)
    svc.lessons.add("general", "除法前先检查分母是否为 0", "做除法时", "all", "code", ["code:ZeroDivisionError:division by zero"])
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "算一下", mode="single")
        await svc.wait(run.id)
        assert run.lesson_ids == [1] and "除法前先检查分母" in model.calls[1]["messages"][0]["content"]
        assert not any(e.type == T.REFLECTION for e in svc.trace.events(run.id))
        assert svc.lessons.get(1).uses == 0
    finally:
        await svc.shutdown()


def test_credit_retires_lessons_that_do_not_help(tmp_path):
    store = LessonStore(tmp_path / "l.db")
    a = store.add("water", "画图用 update_layout", scope="all", category="code", signatures=["code:AttributeError:'…' object has no attribute '…'"])
    b = store.add("water", "作者手写的教训", origin="manual", signatures=["code:AttributeError:'…' object has no attribute '…'"])
    c = store.add("water", "没有来源的教训", signatures=[])
    repeat = ["code:AttributeError:'…' object has no attribute '…'"]
    assert store.credit([a.id, b.id, c.id], repeat) == {a.id: "failed", b.id: "failed"}  # c cannot be credited
    store.credit([a.id, b.id], repeat)
    assert store.credit([a.id, b.id], repeat) == {a.id: "retired", b.id: "failed"}  # manual lessons are pinned
    assert store.get(a.id).status == "retired" and store.get(b.id).status == "active"
    assert a.id not in [x.id for x in store.select("water", "画图 update_layout")]

    # found again by the reflector: counted, but a lesson that did not help stays retired
    store.reinforce(a.id, "run2", ["code:AttributeError:other"])
    x = store.get(a.id)
    assert x.status == "retired" and x.hits == 2 and x.source_runs == ["run2"] and len(x.signatures) == 2  # new message kept

    assert store.similar("water", "画图用 update_layout") is not None
    assert store.similar("business", "画图用 update_layout").id == a.id  # scope "all" is visible everywhere
    assert store.all("business") == [store.get(a.id)]


def test_signature_matching():
    assert signature_matches("review:W001", "review:W001") and not signature_matches("review:W001", "review:W002")
    assert signature_matches("code:KeyError:'…'", "code:KeyError:'…'")
    assert not signature_matches("code:KeyError:'…'", "code:ValueError:'…'")
    assert signature_matches("evidence:rejected", "evidence:rejected")


def test_parse_lessons_drops_malformed_items():
    data = {"lessons": [
        {"text": "短", "from": [1]},
        {"text": "登记百分比结论前先把百分数 print 出来", "when": "登记结论时", "scope": "weird", "from": [1, 9], "reinforces": "L3"},
        "not a dict",
    ]}
    (only,) = parse_lessons(data, n_failures=2, known_ids={3})
    assert only["scope"] == "pack" and only["from"] == [1] and only["reinforces"] == 3
    assert parse_lessons(data, 2, known_ids=set())[0]["reinforces"] is None


def test_split_is_stratified_and_respects_explicit_split():
    qs = [Question(id=f"q{i}", type=t, question="") for i, t in enumerate(["a", "a", "a", "b", "b", "c"])]
    qs.append(Question(id="fixed", type="a", question="", split="train"))
    train, test = split_questions(qs)
    assert [q.id for q in test] == ["q0", "q2", "q3", "q5"] and [q.id for q in train] == ["q1", "q4", "fixed"]


class AlwaysFails:
    """Every analysis hits the same KeyError and gives up; the reflector learns one lesson from it."""

    model = "fake"

    def __init__(self):
        self.calls = []

    async def chat(self, messages, tools=None, json_mode=False):
        self.calls.append(messages)
        last = messages[-1]["content"] if messages[-1]["role"] == "user" else ""
        if messages[0]["content"].startswith("你是反思员"):
            lesson = {"text": "引用列名前先用 inspect_data 查看表结构", "when": "写查询时", "scope": "all", "from": [1]}
            return say(json.dumps({"lessons": [lesson]}, ensure_ascii=False))
        if json_mode and "制定分析计划" in last:
            return plan(["计算"])
        if "请根据以下已登记的结论" in last:
            return say("## 结论\n没有得到结果。")
        if not any(m["role"] == "tool" for m in messages):
            return say("", tool("run_python", code="Invoice['Nope']", purpose="取列"))
        return say("无法完成。")


@requires_data
async def test_evolution_experiment_learns_on_train_and_retires_useless_lessons(settings):
    settings.review = "rules"
    model = AlwaysFails()
    report = await run_evolution(settings, "business", rounds=2, mode="single", only=["b01", "b02", "b03", "b04"],
                                 model_factory=lambda: model, embedder=False, quiet=True)
    assert report["test"] == ["b01", "b03"] and report["train"] == ["b02", "b04"]
    r0, r1, r2 = report["rounds"]
    assert (r0["lessons"], r0["lessons_used_avg"], r0["accuracy_pct"], r0["failures"]) == ("off", 0, 0, {"code": 2})
    assert (r1["lessons"], r1["lessons_used_avg"]) == ("use", 1)
    # The lesson was in the prompt for 3 training runs and the same KeyError happened every time: retired,
    # although the reflector kept producing it. The last test round no longer uses it.
    (lesson,) = report["lessons"]
    assert lesson["status"] == "retired" and (lesson["uses"], lesson["failed_after"], lesson["hits"]) == (3, 3, 4)
    assert r2["lessons_used_avg"] == 0 and report["training"][1]["lessons_active"] == 0

    # wrong eval answers reach the reflector as failures
    prompts = [m[-1]["content"] for m in model.calls if m[0]["content"].startswith("你是反思员")]
    assert "评测答错" in prompts[0] and "KeyError" in prompts[0]
    md = open(report["files"][1], encoding="utf-8").read()
    assert "第 2 轮（用前 2 遍的经验）" in md and "| 停用 |" in md


def test_lessons_api(settings):
    from fastapi.testclient import TestClient

    from proven.api.app import create_app

    app = create_app(make_service(settings, ScriptedChat([])))
    with TestClient(app) as client:
        made = client.post("/api/lessons", json={"pack": "water", "text": "换算径流深前确认流量单位", "when": "计算径流系数时"}).json()
        assert made["origin"] == "manual" and made["pinned"] and made["label"] == "L1"
        assert client.post("/api/lessons", json={"pack": "water", "text": " "}).status_code == 400
        assert [x["id"] for x in client.get("/api/lessons?pack=water").json()] == [made["id"]]
        patched = client.patch(f"/api/lessons/{made['id']}", json={"status": "retired", "text": "改过的"}).json()
        assert patched["status"] == "retired" and patched["text"] == "改过的"
        assert client.get("/api/lessons?pack=water&status=active").json() == []
        assert client.patch("/api/lessons/99", json={"status": "retired"}).status_code == 404
        assert client.delete(f"/api/lessons/{made['id']}").json() == {"ok": True}
        assert client.patch("/api/settings", json={"lessons": "use"}).json()["lessons"] == "use"
        assert client.patch("/api/settings", json={"lessons": "x"}).status_code == 400
        assert client.get("/api/evolve").json() == []


def test_service_rejects_unknown_lessons_mode(settings):
    svc = make_service(settings, ScriptedChat([]))
    with pytest.raises(ValueError, match="经验模式"):
        svc.start_run(None, "x", lessons="maybe")  # validated before the session is touched


async def test_reflector_is_told_which_lessons_did_not_help(settings):
    settings.lessons = "learn"

    def reflector(messages):
        prompt = last_user(messages)
        assert "[L1] 除法前先检查分母（已停用：用过 3 次，同样的失败仍然出现" in prompt
        return say(json.dumps({"lessons": [{"text": "除法用 np.divide 并指定 where 参数，分母为 0 时得到缺失值", "when": "做除法时",
                                            "scope": "all", "from": [1], "reinforces": None}]}, ensure_ascii=False))

    model = ScriptedChat([plan(["计算"]), say("", tool("run_python", code="1/0", purpose="出错")), say("完成"), say("完成"),
                          say("## 结论\n无"), reflector])
    svc = make_service(settings, model)
    old = svc.lessons.add("general", "除法前先检查分母", scope="all", category="code", signatures=["code:ZeroDivisionError:division by zero"])
    for _ in range(3):
        svc.lessons.credit([old.id], ["code:ZeroDivisionError:division by zero"])
    assert svc.lessons.get(old.id).status == "retired"
    session = await svc.create_session("general")
    try:
        run = svc.start_run(session, "算一下", mode="single")
        await svc.wait(run.id)
        assert run.lesson_ids == []  # retired lessons are not put into the prompt
        (new,) = svc.lessons.all("general", status="active")
        assert new.text.startswith("除法用 np.divide")
    finally:
        await svc.shutdown()
