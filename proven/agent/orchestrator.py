"""The agent loop: plan -> (approve) -> execute -> verify -> report -> check.

Single agent with explicit phases. Each phase is a separate method so it can later become its own
agent (Planner / Analyst / Reviewer / Writer) without changing tools or the trace format.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any

from .. import trace as T
from ..config import Settings
from ..findings import check_report
from ..llm import ChatModel, LLMResponse
from ..tools import ToolRegistry, builtin_tools
from . import prompts as P
from .run import Run, RunContext
from .session import Session

KEEP_FULL_TOOL_RESULTS = 6  # older tool results are shortened to keep the context small
SHORT_TOOL_RESULT = 600


class Orchestrator:
    def __init__(self, model: ChatModel, settings: Settings, tools: ToolRegistry | None = None):
        self.model = model
        self.settings = settings
        self.tools = tools or builtin_tools()

    # ------------------------------------------------------------------ public API

    async def run(self, session: Session, run: Run) -> Run:
        ctx = RunContext(session, run, self.settings)
        session.runs[run.id] = run
        ctx.emit(T.RUN_STARTED, question=run.question, auto_approve=run.auto_approve, model=self.model.model, pack=session.pack.id)
        try:
            system = self._system_prompt(session)
            plan = await self._plan(ctx, system)
            if run.cancelled:
                return self._finish(ctx, "cancelled")
            if plan.get("answerable", True) is False:
                draft = f"无法回答：{plan.get('reason', '')}"
            else:
                draft = await self._execute(ctx, system, plan)
                if run.status == "needs_input":
                    # Keep the exchange so the user's next message is read as the answer.
                    session.history += [
                        {"role": "user", "content": run.question},
                        {"role": "assistant", "content": f"在继续分析之前需要你确认：{run.pending_question}"},
                    ]
                    return self._finish(ctx, "needs_input")
                if run.cancelled:
                    return self._finish(ctx, "cancelled")
            await self._report(ctx, draft)
            session.history += [
                {"role": "user", "content": run.question},
                {"role": "assistant", "content": run.report},
            ]
            return self._finish(ctx, "done")
        except asyncio.CancelledError:
            self._finish(ctx, "cancelled")
            raise
        except Exception as e:  # noqa: BLE001 - surface any failure to the UI instead of dying silently
            ctx.emit(T.RUN_FINISHED, status="error", error=f"{type(e).__name__}: {e}")
            run.status = "error"
            return run

    @staticmethod
    def approve(run: Run, plan: dict[str, Any] | None = None) -> None:
        if run._approval and not run._approval.done():
            run._approval.set_result(plan or run.plan)

    @staticmethod
    def cancel(run: Run) -> None:
        run.cancelled = True
        if run._approval and not run._approval.done():
            run._approval.set_result(None)

    # ------------------------------------------------------------------ phases

    def _system_prompt(self, session: Session) -> str:
        return P.system_prompt(
            session.pack.prompt,
            session.semantic.summary(session.semantic_datasets),
            P.format_profiles(session.profiles),
            [d["name"] for d in session.documents],
            len(session.experience.all(session.pack.id)),
        )

    async def _plan(self, ctx: RunContext, system: str) -> dict[str, Any]:
        run = ctx.run
        run.status = "planning"
        messages = [
            {"role": "system", "content": system},
            *ctx.session.history[-4:],
            {"role": "user", "content": f"用户问题：{run.question}\n\n{P.PLAN}"},
        ]
        resp = await self._call(ctx, messages, phase="plan", json_mode=True)
        plan = _parse_json(resp.content) or {
            "understanding": run.question,
            "answerable": True,
            "assumptions": [],
            "steps": [{"title": "分析", "detail": resp.content.strip()[:500]}],
        }
        plan.setdefault("steps", [])
        plan.setdefault("assumptions", [])
        run.plan = plan
        ctx.emit(T.PLAN_PROPOSED, plan=plan, awaiting_approval=not run.auto_approve)

        if not run.auto_approve:
            run.status = "awaiting_approval"
            run._approval = asyncio.get_running_loop().create_future()
            approved = await run._approval
            if approved is None:  # cancelled while waiting
                return plan
            edited = approved != run.plan
            plan = run.plan = approved
            ctx.emit(T.PLAN_APPROVED, plan=plan, edited=edited)
        return plan

    async def _execute(self, ctx: RunContext, system: str, plan: dict[str, Any]) -> str:
        run = ctx.run
        run.status = "running"
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            *ctx.session.history[-4:],
            {
                "role": "user",
                "content": f"用户问题：{run.question}\n\n已确认的分析计划：\n{P.plan_to_text(plan)}\n\n"
                "请按计划执行。完成后不再调用工具，用一段话总结你的分析过程和发现。",
            },
        ]
        nudged = False
        for step in range(1, self.settings.max_steps + 1):
            if run.cancelled:
                return ""
            _compact(messages)
            resp = await self._call(ctx, messages, phase="execute", tools=self.tools.schemas(), step=step)
            messages.append(resp.as_message())
            if resp.content.strip() and resp.tool_calls:
                ctx.emit(T.THOUGHT, text=resp.content.strip(), step=step)

            if not resp.tool_calls:
                if not run.findings.items and not nudged and plan.get("answerable", True):
                    nudged = True
                    messages.append({"role": "user", "content": P.NUDGE_NO_FINDINGS})
                    continue
                return resp.content

            for call in resp.tool_calls:
                result_text, stop = await self._dispatch(ctx, call, step)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": result_text})
                if stop:
                    run.status = "needs_input"
                    return ""

        ctx.emit(T.THOUGHT, text=f"已达到最大步数 {self.settings.max_steps}，基于已有结论生成报告。", step=self.settings.max_steps)
        return "（达到最大步数，分析可能不完整）"

    async def _dispatch(self, ctx: RunContext, call, step: int) -> tuple[str, bool]:
        tool = self.tools.get(call.name)
        ctx.emit(T.TOOL_CALL, name=call.name, arguments=call.arguments, call_id=call.id, step=step)
        started = time.monotonic()
        if call.parse_error:
            text, ok, data, stop = f"工具参数解析失败：{call.parse_error}。请重新调用，参数必须是 JSON 对象。", False, {}, False
        elif tool is None:
            text, ok, data, stop = f"没有名为 {call.name} 的工具。可用工具：{', '.join(self.tools.names())}", False, {}, False
        else:
            try:
                r = await tool.handler(ctx, call.arguments)
                text, ok, data, stop = r.text, r.ok, r.data, r.stop
            except Exception as e:  # noqa: BLE001 - tool failures go back to the model
                text, ok, data, stop = f"工具执行异常：{type(e).__name__}: {e}", False, {}, False
        ctx.emit(
            T.TOOL_RESULT,
            name=call.name,
            call_id=call.id,
            ok=ok,
            text=text,
            data=data,
            step=step,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return text, stop

    async def _report(self, ctx: RunContext, draft: str) -> None:
        run = ctx.run
        run.status = "reporting"
        figures = [
            f"- [{cid}] {o.text}"
            for cid in run.cell_ids
            for o in ctx.session.cells[cid].outputs
            if o.kind == "figure"
        ]
        prompt = P.REPORT.format(
            question=run.question,
            findings=P.format_findings(run.findings.items),
            figures="\n".join(figures) or "（无）",
            draft=draft or "（无）",
        )
        messages = [{"role": "system", "content": "你是严谨的数据分析报告撰写者。"}, {"role": "user", "content": prompt}]
        resp = await self._call(ctx, messages, phase="report")
        report = _strip_fence(resp.content)
        allowed = [run.question, json.dumps(run.plan or {}, ensure_ascii=False)]
        check = check_report(report, run.findings, extra_allowed=allowed)
        ctx.emit(T.CHECK, attempt=1, **check.to_dict())

        if not check.ok:
            problems = [f"- 数字 {u['number']} 没有对应的已登记结论（上下文：…{u['context']}…）" for u in check.unsupported]
            problems += [f"- 引用了不存在的结论 {c}" for c in check.unknown_citations]
            messages += [resp.as_message(), {"role": "user", "content": P.REPORT_FIX.format(problems="\n".join(problems))}]
            resp = await self._call(ctx, messages, phase="report_fix")
            report = _strip_fence(resp.content)
            check = check_report(report, run.findings, extra_allowed=allowed)
            ctx.emit(T.CHECK, attempt=2, **check.to_dict())

        run.report = report
        run.check = check.to_dict()
        ctx.emit(T.REPORT, markdown=report, check=run.check, findings=[f.to_dict() for f in run.findings.items])

    # ------------------------------------------------------------------ helpers

    async def _call(self, ctx: RunContext, messages, phase: str, tools=None, json_mode=False, step: int | None = None) -> LLMResponse:
        started = time.monotonic()
        resp = await self.model.chat(messages, tools=tools, json_mode=json_mode)
        run = ctx.run
        run.usage["llm_calls"] += 1
        for k in ("input_tokens", "output_tokens"):
            run.usage[k] += resp.usage.get(k, 0)
        ctx.emit(
            T.LLM_CALL,
            phase=phase,
            step=step,
            model=resp.model or self.model.model,
            usage=resp.usage,
            duration_ms=int((time.monotonic() - started) * 1000),
            content=resp.content[:2000],
            reasoning=resp.reasoning[:4000],
            tool_calls=[{"name": c.name, "arguments": c.arguments} for c in resp.tool_calls],
        )
        return resp

    def _finish(self, ctx: RunContext, status: str) -> Run:
        ctx.run.status = status
        ctx.emit(T.RUN_FINISHED, status=status, usage=ctx.run.usage)
        return ctx.run


def _compact(messages: list[dict[str, Any]]) -> None:
    """Shorten old tool results in place; the full text is always in the trace."""
    tool_idx = [i for i, m in enumerate(messages) if m["role"] == "tool"]
    for i in tool_idx[:-KEEP_FULL_TOOL_RESULTS]:
        c = messages[i]["content"]
        if len(c) > SHORT_TOOL_RESULT:
            messages[i]["content"] = c[:SHORT_TOOL_RESULT] + "\n...[较早的输出已折叠]"


def _parse_json(text: str) -> dict[str, Any] | None:
    text = _strip_fence(text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _strip_fence(text: str) -> str:
    text = text.strip()
    m = re.match(r"^```(?:\w+)?\s*\n(.*)\n```$", text, re.S)
    return m.group(1).strip() if m else text
