"""Evolution experiment (multi-agent phase 3): do lessons from past failures make later runs better?

Protocol, chosen so the agent never learns from the questions it is scored on:

    split the pack's questions into train and test (stratified by question type)
    round 0   test,  no lessons                       -> baseline
    train 1   train, lessons learned after each run   (a wrong answer is also a failure to learn from)
    round 1   test,  lessons read but not updated
    train 2   train, learn again                      (lessons are reinforced, or retired if useless)
    round 2   test,  lessons read but not updated

The experiment runs in its own workspace, so it starts from an empty lesson store and does not touch
the lessons of normal use. With a dozen questions per pack, differences of one or two questions are
within noise: read the failure counts alongside accuracy, and add questions before drawing conclusions.
"""

from __future__ import annotations

import dataclasses
import json
import time
from collections import Counter
from dataclasses import asdict
from typing import Any, Callable

from .agent.reflector import KIND_LABEL, Failure, collect_failures
from .config import Settings
from .evals import Question, ask, compute_references, load_questions
from .service import Service


def split_questions(questions: list[Question]) -> tuple[list[Question], list[Question]]:
    """An explicit `split:` wins; otherwise alternate within each question type, starting with test,
    so every type is tested and the test set is at least as large as the training set."""
    train, test = [], []
    seen: Counter = Counter()
    for q in questions:
        if q.split in ("train", "test"):
            (train if q.split == "train" else test).append(q)
            continue
        (test if seen[q.type] % 2 == 0 else train).append(q)
        seen[q.type] += 1
    return train, test


async def run_evolution(settings: Settings, pack_id: str, rounds: int = 2, mode: str | None = None, review: str | None = None,
                        only: list[str] | None = None, model_factory: Callable | None = None, embedder=None,
                        quiet: bool = False) -> dict[str, Any]:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = settings.workspace / "evals" / "evolve"
    work = out_dir / f"{stamp}-{pack_id}"
    service = Service(dataclasses.replace(settings, workspace=work), model_factory=model_factory, embedder=embedder,
                      use_default_embedder=embedder is None and model_factory is None)
    log = (lambda *a: None) if quiet else print
    try:
        pack = service.packs[pack_id]
        questions = [q for q in load_questions(pack) if not only or q.id in only]
        train, test = split_questions(questions)
        if not train or not test:
            raise ValueError("训练集和测试集都至少需要一道题")
        refs = await compute_references(service, pack, questions)

        async def run_pass(label: str, kind: str, qs: list[Question], lessons: str) -> dict[str, Any]:
            log(f"\n== {label}（{'测试集' if kind == 'test' else '训练集'}，{len(qs)} 题）==")
            learn = lessons == "learn"
            rows, fails = [], Counter()
            injected = 0
            for q in qs:
                result, run = await ask(service, pack, q, refs, mode=mode, review=review, lessons=lessons, defer_reflection=learn)
                failures = collect_failures(service.trace.events(run.id))
                if learn:
                    extra = [] if result.passed else [
                        Failure("eval", f"eval:{q.type}", f"评测答错（{result.note or result.status}）。题目：{q.question}")]
                    await service.reflect(run.id, extra=extra, forbidden=refs.get(q.id) or [])
                for f in failures:
                    fails[f.kind] += f.count
                injected += len(run.lesson_ids)
                row = asdict(result) | {"failures": {f.kind: f.count for f in failures}, "lessons_used": len(run.lesson_ids),
                                        "tokens": run.usage["input_tokens"] + run.usage["output_tokens"], "llm_calls": run.usage["llm_calls"]}
                rows.append(row)
                log(f"  {'✓' if result.passed else '✗'} {q.id} 失败 {sum(row['failures'].values())} 次  参考教训 {row['lessons_used']} 条  {result.note}")
            n = len(rows) or 1
            return {
                "label": label,
                "set": kind,
                "lessons": lessons,
                "total": len(rows),
                "passed": sum(r["passed"] for r in rows),
                "accuracy_pct": round(100 * sum(r["passed"] for r in rows) / n, 1),
                "failures": dict(fails),
                "failures_total": sum(fails.values()),
                "tokens": sum(r["tokens"] for r in rows),
                "llm_calls": sum(r["llm_calls"] for r in rows),
                "lessons_active": len(service.lessons.all(pack.id, status="active")),
                "lessons_used_avg": round(injected / n, 1),
                "results": rows,
            }

        test_rounds = [await run_pass("第 0 轮（无经验）", "test", test, "off")]
        training = []
        for r in range(1, rounds + 1):
            training.append(await run_pass(f"训练第 {r} 遍", "train", train, "learn"))
            test_rounds.append(await run_pass(f"第 {r} 轮（用前 {r} 遍的经验）", "test", test, "use"))

        report = {
            "pack": pack_id,
            "model": service.model.model,
            "mode": mode or settings.mode,
            "review": review or settings.review,
            "time": time.strftime("%Y-%m-%d %H:%M"),
            "train": [q.id for q in train],
            "test": [q.id for q in test],
            "rounds": test_rounds,
            "training": training,
            "lessons": [x.to_dict() for x in service.lessons.all(pack.id)],
            "workspace": str(work),
        }
        stem = f"{stamp}-{pack_id}"
        (out_dir / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        (out_dir / f"{stem}.md").write_text(to_markdown(report), encoding="utf-8")
        report["files"] = [str(out_dir / f"{stem}.json"), str(out_dir / f"{stem}.md")]
        return report
    finally:
        await service.shutdown()


def to_markdown(report: dict[str, Any]) -> str:
    kinds = sorted({k for r in report["rounds"] + report["training"] for k in r["failures"]})
    head = "| 轮次 | 正确率 | " + " | ".join(KIND_LABEL.get(k, k) for k in kinds) + " | 失败合计 | Token | 可用教训 | 平均参考 |"
    lines = [
        f"# 经验进化实验：{report['pack']} · {report['model']} · {report['mode']} 模式 · 审核 {report['review']}",
        "",
        f"时间：{report['time']}　训练集：{', '.join(report['train'])}　测试集：{', '.join(report['test'])}",
        "",
        "## 测试集上的变化",
        "",
        head,
        "|" + "---|" * (len(kinds) + 6),
    ]
    for r in report["rounds"]:
        cells = " | ".join(str(r["failures"].get(k, 0)) for k in kinds)
        lines.append(f"| {r['label']} | {r['accuracy_pct']}%（{r['passed']}/{r['total']}） | {cells} | {r['failures_total']} | "
                     f"{r['tokens']:,} | {r['lessons_active']} | {r['lessons_used_avg']} |")
    lines += ["", "## 训练过程", "", "| 训练 | 正确率 | 失败合计 | 结束时可用教训 |", "|---|---|---|---|"]
    lines += [f"| {r['label']} | {r['accuracy_pct']}% | {r['failures_total']} | {r['lessons_active']} |" for r in report["training"]]
    lines += ["", "## 学到的教训", "", "| 编号 | 状态 | 教训 | 来源 | 总结次数 | 使用 | 有效 / 无效 |", "|---|---|---|---|---|---|---|"]
    for x in report["lessons"]:
        status = "停用" if x["status"] == "retired" else "可用"
        lines.append(f"| {x['label']} | {status} | {(x['when'] + '：') if x['when'] else ''}{x['text']} | {x['category']} | {x['hits']} | "
                     f"{x['uses']} | {x['helped']} / {x['failed_after']} |")
    lines += ["", "> 每个测试集只有十几道题，一两题的差异在随机波动范围内。看结论时要同时看失败次数的变化，题目越多结论越可靠。"]
    return "\n".join(lines) + "\n"
