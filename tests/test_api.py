import json
import time

from conftest import make_service, requires_data
from fastapi.testclient import TestClient

from proven.api.app import create_app
from proven.testing import ScriptedChat, plan, say, tool

pytestmark = requires_data


def test_api_flow(settings):
    model = ScriptedChat(
        [
            plan(["统计客户数"]),
            say("", tool("run_python", code="print(len(Customer))", purpose="客户数")),
            say("", tool("record_finding", claim="共有 59 位客户", evidence="C1", value=59)),
            say("完成"),
            say("## 结论\n共有 59 位客户 [F1]。"),
        ]
    )
    app = create_app(make_service(settings, model))
    with TestClient(app) as client:
        packs = client.get("/api/packs").json()
        assert {p["id"] for p in packs} >= {"general", "business", "water"}

        sid = client.post("/api/sessions", json={"pack": "business"}).json()["id"]
        r = client.post(f"/api/sessions/{sid}/datasets/chinook").json()
        assert "Customer" in r["tables"]

        up = client.post(f"/api/sessions/{sid}/upload", files={"files": ("notes.md", "# 说明\n退货率按退货订单数除以总订单数计算。".encode())})
        assert up.json()["files"][0]["kind"] == "document"

        run = client.post(f"/api/sessions/{sid}/runs", json={"question": "有多少客户？", "auto_approve": False}).json()
        rid = run["id"]

        # TestClient buffers streaming bodies, so approve first and then read the whole stream.
        for _ in range(200):
            if client.get(f"/api/runs/{rid}").json()["status"] == "awaiting_approval":
                break
            time.sleep(0.05)
        assert client.post(f"/api/runs/{rid}/approve", json={}).json()["ok"]
        with client.stream("GET", f"/api/runs/{rid}/events") as s:
            events = [json.loads(l[6:]) for l in s.iter_lines() if l.startswith("data: ")]
        types = [e["type"] for e in events]
        assert types[0] == "run.started" and "plan.approved" in types and types[-1] == "run.finished"
        assert [e["seq"] for e in events] == sorted(e["seq"] for e in events)

        summary = client.get(f"/api/runs/{rid}").json()
        assert summary["status"] == "done" and summary["check"]["ok"]

        # replay from the middle returns only later events
        with client.stream("GET", f"/api/runs/{rid}/events?after=3") as s:
            replay = [json.loads(l[6:]) for l in s.iter_lines() if l.startswith("data: ")]
        assert replay[0]["seq"] == 4

        nb = client.get(f"/api/sessions/{sid}/notebook")
        assert nb.status_code == 200 and "print(len(Customer))" in nb.text
        assert client.post(f"/api/runs/{rid}/verify").json()["experience_id"] == 1
        assert client.get(f"/api/runs/{rid}/otel").json()["resourceSpans"][0]["scopeSpans"][0]["spans"]
        assert client.get(f"/api/sessions/{sid}/chunks/D1").json()["source"] == "数据质量与指标口径说明.md"


def test_run_log_export(settings):
    from proven.trace_export import list_runs, run_to_markdown

    model = ScriptedChat(
        [
            plan(["统计"]),
            say("", tool("run_python", code="print(len(Customer))", purpose="客户数")),
            say("", tool("run_python", code="1/0", purpose="错误")),
            say("", tool("record_finding", claim="共有 59 位客户", evidence="C1")),
            say("完成"),
            say("共有 59 位客户 [F1]，增长 12.5%。"),
            say("共有 59 位客户 [F1]。"),
        ]
    )
    app = create_app(make_service(settings, model))
    with TestClient(app) as client:
        sid = client.post("/api/sessions", json={"pack": "business"}).json()["id"]
        client.post(f"/api/sessions/{sid}/datasets/chinook")
        rid = client.post(f"/api/sessions/{sid}/runs", json={"question": "有多少客户？", "auto_approve": True}).json()["id"]
        with client.stream("GET", f"/api/runs/{rid}/events") as s:
            list(s.iter_lines())
        r = client.get(f"/api/runs/{rid}/log.md")
        assert r.status_code == 200
        md = r.text
        assert "# 运行日志" in md and "print(len(Customer))" in md and "ZeroDivisionError" in md
        assert "失败 1 次" in md and "未通过" in md and "## 最终报告" in md
        store = app.state.service.trace
        assert list_runs(store)[0]["run_id"] == rid


def test_ui_support_endpoints(settings):
    model = ScriptedChat(
        [
            plan(["统计"]),
            say("", tool("run_python", code="print(len(Customer))", purpose="客户数")),
            say("", tool("record_finding", claim="共有 59 位客户", evidence="C1")),
            say("完成"),
            say("共有 59 位客户 [F1]。"),
        ]
    )
    service = make_service(settings, model)
    app = create_app(service)
    with TestClient(app) as client:
        # runtime settings
        s = client.get("/api/settings").json()
        assert s["mode"] == "single" and "limits" in s and "api_key" not in json.dumps(s)
        assert client.patch("/api/settings", json={"mode": "multi", "step_budget": 12}).json()["step_budget"] == 12
        assert service.settings.mode == "multi"
        assert client.patch("/api/settings", json={"step_budget": 999}).status_code == 400
        assert client.patch("/api/settings", json={"mode": "x"}).status_code == 400
        client.patch("/api/settings", json={"mode": "single"})

        sid = client.post("/api/sessions", json={"pack": "business"}).json()["id"]
        client.post(f"/api/sessions/{sid}/datasets/chinook")

        rows = client.get(f"/api/sessions/{sid}/tables/Customer/rows?offset=10&limit=5").json()
        assert rows["total"] == 59 and len(rows["rows"]) == 5 and rows["rows"][0]["CustomerId"] == 11

        hits = client.post(f"/api/sessions/{sid}/knowledge/search", json={"query": "参照完整性 外键"}).json()
        assert hits["hits"] and hits["vector"] is False and "参照完整性" in hits["hits"][0]["text"]

        rid = client.post(f"/api/sessions/{sid}/runs", json={"question": "客户数", "auto_approve": True}).json()["id"]
        with client.stream("GET", f"/api/runs/{rid}/events") as st:
            list(st.iter_lines())
        hist = client.get("/api/history").json()
        assert hist[0]["run_id"] == rid and hist[0]["live"] is True and hist[0]["status"] == "done"

        exp_id = client.post(f"/api/runs/{rid}/verify").json()["experience_id"]
        assert [e["id"] for e in client.get("/api/experiences?pack=business").json()] == [exp_id]
        assert client.delete(f"/api/experiences/{exp_id}").json()["ok"]
        assert client.get("/api/experiences?pack=business").json() == []

        # a run that is no longer in memory can still be replayed from the trace
        service.runs.pop(rid)
        with client.stream("GET", f"/api/runs/{rid}/events") as st:
            replay = [l for l in st.iter_lines() if l.startswith("data: ")]
        assert json.loads(replay[-1][6:])["type"] == "run.finished"
        assert client.get("/api/runs/nope/events").status_code == 404

        # eval reports
        out = settings.workspace / "evals"
        out.mkdir(parents=True, exist_ok=True)
        (out / "r1.json").write_text(json.dumps({"pack": "water", "model": "m", "mode": "multi", "time": "t", "summary": {"accuracy_pct": 50}, "results": []}))
        assert client.get("/api/evals").json()[0]["name"] == "r1"
        assert client.get("/api/evals/r1").json()["mode"] == "multi"
        assert client.get("/api/evals/nope").status_code == 404
        leak = client.get("/api/evals/..%2F..%2Fpyproject")  # never reaches a file outside evals/
        assert "[project]" not in leak.text and "results" not in leak.text
