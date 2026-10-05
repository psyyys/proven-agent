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
        run = svc.start_run(session, args.question)
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
        report = await run_eval(svc, args.pack, only=args.only, out_dir=settings.workspace / "evals")
        print(json.dumps(report["summary"], ensure_ascii=False, indent=1))
        for f in report.get("files", []):
            print("→", f)
    finally:
        await svc.shutdown()


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

    e = sub.add_parser("eval", help="运行评测")
    e.add_argument("--pack", required=True)
    e.add_argument("--only", nargs="*", help="只运行指定编号的题目")
    e.add_argument("--references-only", action="store_true", help="只计算标准答案（不调用模型）")

    sub.add_parser("doctor", help="检查模型配置与网络连接")

    args = ap.parse_args(argv)
    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("proven.api.app:create_app", factory=True, host=args.host, port=args.port)
    elif args.cmd == "ask":
        asyncio.run(_ask(args))
    elif args.cmd == "eval":
        asyncio.run(_eval(args))
    elif args.cmd == "doctor":
        from .doctor import main as doctor_main

        return doctor_main()


if __name__ == "__main__":
    sys.exit(main())
