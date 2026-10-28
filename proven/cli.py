"""Command line: `proven serve`, `proven ask`, `proven eval`."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from . import trace as T
from .config import Settings


def _print_event(e: T.Event) -> None:
    d = e.data
    if e.type == T.PLAN_PROPOSED:
        print("\n📋 计划：" + d["plan"].get("understanding", ""))
        for i, s in enumerate(d["plan"].get("steps", []), 1):
            print(f"   {i}. {s['title']} — {s.get('detail', '')}")
    elif e.type == T.STEP_STARTED:
        print(f"\n━━ 第 {d['task']}/{d['total']} 步 · {d['title']} · 分析员 ━━")
    elif e.type == T.STEP_FINISHED:
        print(f"   ↳ [{d['status']}] {d['summary']}  结论：{', '.join(d['findings']) or '无'}")
    elif e.type == T.THOUGHT:
        print(f"\n💭 {d['text']}")
    elif e.type == T.TOOL_CALL:
        args = d["arguments"]
        brief = args.get("purpose") or args.get("query") or args.get("claim") or args.get("question") or ""
        print(f"\n🔧 {d['name']}  {brief}")
        if "code" in args or "sql" in args:
            print("   " + (args.get("code") or args.get("sql")).strip().replace("\n", "\n   "))
    elif e.type == T.TOOL_RESULT:
        text = d["text"] if len(d["text"]) < 800 else d["text"][:800] + " …"
        print(("   ✓ " if d["ok"] else "   ✗ ") + text.replace("\n", "\n     "))
    elif e.type == T.REVIEW:
        action = {"redo": "退回重做", "accept": "通过", "final": "复审完成"}.get(d["action"], d["action"])
        print(f"\n🧐 审核（第 {d['round']} 轮）：错误 {d['errors']}，警告 {d['warnings']} → {action}")
        for i in d["issues"]:
            who = i["rule_id"] or "审核员"
            print(f"   [{who} · {'错误' if i['severity'] == 'error' else '警告'}] {i['finding_id']}：{i['detail'] or i['message']}")
    elif e.type == T.FINDING_RETRACTED:
        print(f"   ↺ {d['id']} 已被 {d['replaced_by']} 替换")
    elif e.type == T.CHECK:
        print(f"\n🔎 数字核查（第 {d['attempt']} 次）：{'通过' if d['ok'] else '未通过'}，检查 {d['checked']} 个数字")
    elif e.type == T.REPORT:
        print("\n" + "=" * 60 + "\n" + d["markdown"] + "\n" + "=" * 60)
    elif e.type == T.ASK_USER:
        print(f"\n❓ {d['question']}  {' / '.join(d.get('options') or [])}")
    elif e.type == T.RUN_FINISHED:
        print(f"\n[{d['status']}] {d.get('error', '')} {d.get('usage', '')}")


async def _ask(args) -> None:
    from .service import Service

    svc = Service(Settings.from_env())
    session = await svc.create_session(args.pack)
    try:
        for ds in args.dataset or []:
            await session.load_demo(ds)
        for f in args.file or []:
            p = Path(f)
            print(await session.add_upload(p.name, p.read_bytes()))
        run = svc.start_run(session, args.question, mode=args.mode, review=args.review)
        q = svc.trace.subscribe(run.id)
        task = svc._tasks[run.id]
        while not (task.done() and q.empty()):
            try:
                _print_event(await asyncio.wait_for(q.get(), timeout=0.5))
            except asyncio.TimeoutError:
                pass
    finally:
        await svc.shutdown()


async def _eval(args) -> None:
    from .evals import compute_references, load_questions, run_eval
    from .service import Service

    settings = Settings.from_env()
    if args.references_only:
        svc = Service(settings, model_factory=lambda: None, use_default_embedder=False)
        pack = svc.packs[args.pack]
        refs = await compute_references(svc, pack, load_questions(pack))
        print(json.dumps(refs, ensure_ascii=False, indent=1))
        await svc.shutdown()
        return
    svc = Service(settings)
    try:
        report = await run_eval(svc, args.pack, only=args.only, out_dir=settings.workspace / "evals", mode=args.mode, review=args.review)
        print(json.dumps(report["summary"], ensure_ascii=False, indent=1))
        for f in report.get("files", []):
            print("→", f)
    finally:
        await svc.shutdown()


def _rules(args) -> None:
    from .packs import discover_packs
    from .rules import RuleError

    pack = discover_packs()[args.pack]
    try:
        rules = pack.rules()
    except RuleError as e:
        print(f"规则文件有误：{e}")
        sys.exit(1)
    sev = {"error": "错误", "warning": "警告"}
    print(f"{pack.name}：{len(rules)} 条规则（含通用规则），格式检查通过\n")
    for r in rules.rules:
        print(f"{r.id:<6}{sev[r.severity]:<4}[{r.source}] {r.name}")
        print(f"      触发词：{'、'.join(r.applies_when[:6])}{' …' if len(r.applies_when) > 6 else ''}")
        print(f"      依据：{r.basis or '（未填写）'}")
    if rules.review_points:
        print("\n交给模型审核员的检查要点：")
        for p in rules.review_points:
            print(f"  - {p}")


async def _review_eval(args) -> None:
    from .llm import build_chat_model
    from .packs import discover_packs
    from .review_eval import run_review_eval

    settings = Settings.from_env()
    model = build_chat_model(settings) if args.llm else None
    report = await run_review_eval(discover_packs()[args.pack], model=model, out_dir=settings.workspace / "evals" / "review", only=args.only)
    s = report["summary"]
    print(f"拦截率 {s['catch_rate_pct']}%（{s['caught']}/{s['expected']}），误拦率 {s['false_positive_rate_pct']}%，"
          f"正确结论被误拦 {s['clean_flagged']}/{s['clean_cases']}")
    for r in report["results"]:
        if not r["passed"]:
            print(f"  ✗ {r['id']} {r['claim'][:40]}  应拦 {r['expect'] or '无'}，实际 {r['fired'] or '无'}")
    for f in report.get("files", []):
        print("→", f)


def _logs(args) -> None:
    from .trace import TraceStore
    from .trace_export import list_runs, run_to_markdown

    settings = Settings.from_env()
    db = settings.workspace / "trace.db"
    if not db.exists():
        print(f"还没有运行记录（{db} 不存在）")
        return
    store = TraceStore(db)
    runs = list_runs(store, limit=max(args.n, 1))
    if not args.run_id:
        print(f"{'编号':<12}{'时间':<18}{'状态':<12}{'Token':>9}  问题")
        for r in runs:
            print(f"{r['run_id']:<12}{r['time']:<18}{r['status']:<12}{r['tokens']:>9}  {r['question'][:40]}")
        print("\n导出日志：proven logs <编号>    或    proven logs latest")
        return
    run_id = runs[0]["run_id"] if args.run_id == "latest" and runs else args.run_id
    out_dir = settings.workspace / "logs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"run-{run_id}.md"
    out.write_text(run_to_markdown(store, run_id), encoding="utf-8")
    print(f"已导出：{out.resolve()}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="proven", description="可追溯的数据分析 Agent")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve", help="启动网页服务")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)

    a = sub.add_parser("ask", help="在终端中提一个问题")
    a.add_argument("question")
    a.add_argument("--pack", default="general")
    a.add_argument("--dataset", action="append", help="加载示例数据集（可重复）")
    a.add_argument("--file", action="append", help="上传本地文件（可重复）")
    a.add_argument("--mode", choices=["single", "multi"], help="执行模式，默认取 PROVEN_MODE")
    a.add_argument("--review", choices=["off", "rules", "full"], help="审核模式，默认取 PROVEN_REVIEW")

    e = sub.add_parser("eval", help="运行评测")
    e.add_argument("--pack", required=True)
    e.add_argument("--only", nargs="*", help="只运行指定编号的题目")
    e.add_argument("--references-only", action="store_true", help="只计算标准答案（不调用模型）")
    e.add_argument("--mode", choices=["single", "multi"], help="执行模式，默认取 PROVEN_MODE；用于对比两种模式")
    e.add_argument("--review", choices=["off", "rules", "full"], help="审核模式，默认取 PROVEN_REVIEW；用于对比有无审核员")

    r = sub.add_parser("rules", help="列出并检查领域包的审核规则")
    r.add_argument("--pack", required=True)

    re_ = sub.add_parser("review-eval", help="审核员陷阱测试：统计拦截率和误拦率")
    re_.add_argument("--pack", required=True)
    re_.add_argument("--llm", action="store_true", help="同时运行模型审核（会调用模型）；默认只测规则")
    re_.add_argument("--only", nargs="*", help="只运行指定编号的用例")

    sub.add_parser("doctor", help="检查模型配置与网络连接")

    lg = sub.add_parser("logs", help="查看运行记录，或导出某次运行的日志")
    lg.add_argument("run_id", nargs="?", help="运行编号；写 latest 表示最近一次；不写则列出最近的运行")
    lg.add_argument("-n", type=int, default=15, help="列出的条数")

    args = ap.parse_args(argv)
    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("proven.api.app:create_app", factory=True, host=args.host, port=args.port)
    elif args.cmd == "ask":
        asyncio.run(_ask(args))
    elif args.cmd == "eval":
        asyncio.run(_eval(args))
    elif args.cmd == "rules":
        _rules(args)
    elif args.cmd == "review-eval":
        asyncio.run(_review_eval(args))
    elif args.cmd == "logs":
        _logs(args)
    elif args.cmd == "doctor":
        from .doctor import main as doctor_main

        return doctor_main()


if __name__ == "__main__":
    sys.exit(main())
