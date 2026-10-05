from types import SimpleNamespace

from conftest import make_service, requires_data

from proven.evals import Question, _close, compute_references, load_questions, score
from proven.findings import FindingRegistry


def test_close_variants():
    assert _close(19.38, 19.38, 0.005)
    assert _close(0.1938, 19.38, 0.005)
    assert _close(5.64, -5.64, 0.02)
    assert not _close(6.0, 5.64, 0.02)


def _run(findings, report="", plan=None):
    reg = FindingRegistry()
    for claim, etype in findings:
        reg.add(claim, etype, "C1" if etype == "cell" else "D1", None)
    return SimpleNamespace(findings=reg, report=report, plan=plan or {"answerable": True})


def test_score_types():
    q = Question(id="x", type="basic", question="?")
    assert score(q, _run([("总额为 2328.6 美元", "cell")]), [2328.6])[0]
    assert not score(q, _run([("总额为 2000 美元", "cell")]), [2328.6])[0]
    trap = Question(id="t", type="trap", question="?", expect="refuse")
    assert score(trap, _run([], report="数据中没有年龄字段，无法回答"), None)[0]
    assert not score(trap, _run([("平均年龄为 35.2 岁", "cell")], report="平均年龄 35.2"), None)[0]
    rag = Question(id="r", type="rag", question="?", expect="doc")
    assert score(rag, _run([("参照完整性指外键必须能在主表找到", "doc")]), None)[0]


@requires_data
async def test_reference_answers_compute(settings):
    svc = make_service(settings, model=None)
    try:
        for pack_id in ("business", "water"):
            pack = svc.packs[pack_id]
            qs = load_questions(pack)
            refs = await compute_references(svc, pack, qs)
            assert set(refs) == {q.id for q in qs if q.answer_code}
    finally:
        await svc.shutdown()
