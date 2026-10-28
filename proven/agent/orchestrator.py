"""The agent loop: plan -> (approve) -> execute -> report -> check.

Execution has two modes, chosen per run:
- single: one ReAct loop works through the whole plan.
- multi:  the orchestrator (this code, not a model) runs one analyst per plan step. Each analyst
          starts with a fresh context holding only a handoff card (previous summaries, findings and
          kernel variables) and ends by submitting a structured result. The kernel, the finding
          registry and the trace are shared, so nothing has to be re-sent between analysts.
Both modes use the same ReAct loop, tools and checks.

After execution (single) or after each step (multi), the reviewer checks the new findings: domain
rules by code, then optionally a model in a reviewer role. An error sends the work back once.

Lessons distilled from earlier runs' failures are added to the prompt; after the run, the reflector
turns this run's failures into new lessons and credits the lessons it used.
"""

from __future__ import annotations

import asyncio
import difflib
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any

from .. import trace as T
from ..config import Settings
from ..findings import check_report
from ..lessons import Lesson
from ..llm import ChatModel, LLMResponse
from ..rules import RuleError, RuleSet
from ..tools import SUBMIT_STEP, ToolRegistry, builtin_tools
from . import prompts as P
from . import review as R
from .reflector import Failure, collect_failures, format_failures, leaks_result, parse_lessons
from .review import ReviewResult
from .run import Run, RunContext
from .session import Session

KEEP_FULL_TOOL_RESULTS = 6  # older tool results are shortened to keep the context small
SHORT_TOOL_RESULT = 600
SHORT_CODE = 400


@dataclass
class LoopResult:
    outcome: str  # "answered" | "submitted" | "needs_input" | "cancelled" | "budget"
    text: str = ""
    payload: dict[str, Any] = field(default_factory=dict)


class Orchestrator:
    def __init__(self, model: ChatModel, settings: Settings, tools: ToolRegistry | None = None):
        self.model = model
        self.settings = settings
        self.tools = tools or builtin_tools()

    # ------------------------------------------------------------------ public API

    async def run(self, session: Session, run: Run) -> Run:
        ctx = RunContext(session, run, self.settings)
        session.runs[run.id] = run
        run.mode = run.mode or self.settings.mode
        run.review_mode = run.review_mode or self.settings.review
        run.lessons_mode = run.lessons_mode or self.settings.lessons
        ctx.emit(T.RUN_STARTED, question=run.question, auto_approve=run.auto_approve, model=self.model.model,
                 pack=session.pack.id, mode=run.mode, review=run.review_mode, lessons=run.lessons_mode)
        try:
            ctx.rules = self._load_rules(ctx)
            system = self._system_prompt(session, self._pick_lessons(ctx))
            plan = await self._plan(ctx, system)
            if run.cancelled:
                return self._finish(ctx, "cancelled")
            if plan.get("answerable", True) is False:
                draft = f"无法回答：{plan.get('reason', '')}"
            else:
                if run.mode == "multi":
                    draft = await self._execute_multi(ctx, system, plan)
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
            if run.lessons_mode == "learn" and not run.defer_reflection:
                await self.reflect(session, run, ctx=ctx)
            return self._finish(ctx, "done")
        except asyncio.CancelledError:
            self._finish(ctx, "cancelled")
            raise
        except Exception as e:  # noqa: BLE001 - surface any failure to the UI instead of dying silently
            ctx.emit(T.RUN_FINISHED, status="error", error=describe_error(e))
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

    def _system_prompt(self, session: Session, lessons: list[Lesson] | None = None) -> str:
        return P.system_prompt(
            session.pack.prompt,
            session.semantic.summary(session.semantic_datasets),
            P.format_profiles(session.profiles),
            [d["name"] for d in session.documents],
            len(session.experience.all(session.pack.id)),
            P.format_lessons(lessons or []),
        )

    def _pick_lessons(self, ctx: RunContext) -> list[Lesson]:
        run, store = ctx.run, ctx.session.lessons
        if run.lessons_mode == "off" or store is None:
            return []
        lessons = store.select(ctx.session.pack.id, run.question)
        run.lesson_ids = [x.id for x in lessons]
        if lessons:
            ctx.emit(T.LESSONS_INJECTED, lessons=[x.to_dict() for x in lessons])
        return lessons

    async def reflect(self, session: Session, run: Run, extra: list[Failure] = (), forbidden: list[float] = (),
                      ctx: RunContext | None = None) -> dict[str, Any]:
        """Learn from a finished run: credit the lessons it used, then turn its failures into lessons.

        extra: failures found outside the trace (a wrong eval answer). forbidden: numbers a lesson must
        not contain (the run's results, an eval's reference answer), so lessons stay about method."""
        ctx = ctx or RunContext(session, run, self.settings)
        store = session.lessons
        if store is None:
            return {}
        failures = collect_failures(session.trace.events(run.id)) + list(extra)
        credited = store.credit(run.lesson_ids, [f.signature for f in failures]) if run.lesson_ids else {}
        if not failures and not credited:
            return {}
        ctx.emit(T.REFLECTION_STARTED, failures=len(failures))
        added: list[dict[str, Any]] = []
        reinforced: list[int] = []
        skipped: list[str] = []
        if failures:
            pack = session.pack.id
            retired = [x for x in store.all(pack, status="retired")][-5:]
            existing = store.select(pack, run.question, k=15) + retired
            prompt = P.REFLECT.format(
                question=run.question,
                failures=format_failures(failures),
                existing="\n".join(
                    f"- [{x.label}] {x.when + '：' if x.when else ''}{x.text}"
                    + (f"（已停用：用过 {x.uses} 次，同样的失败仍然出现；不要重复它，换一种更具体的做法）" if x.status == "retired" else "")
                    for x in existing
                ) or "（无）",
                max_lessons=3,
            )
            messages = [{"role": "system", "content": P.REFLECTOR_SYSTEM}, {"role": "user", "content": prompt}]
            try:
                resp = await self._call(ctx, messages, phase="reflect", json_mode=True)
                items = parse_lessons(_parse_json(resp.content), len(failures), {x.id for x in existing})
            except Exception as e:  # noqa: BLE001 - learning is optional, the run itself is done
                ctx.emit(T.THOUGHT, text=f"反思员调用失败，本次不总结教训：{describe_error(e)}")
                items = []
            results = [v for f in run.findings.active() for v in [*f.numbers, *([f.value] if f.value is not None else [])]]
            for it in items:
                if leaks_result(it["text"], [*results, *forbidden]):
                    skipped.append(it["text"])
                    continue
                sources = [failures[i - 1] for i in it["from"]]
                sigs = [f.signature for f in sources]
                target = store.get(it["reinforces"]) if it["reinforces"] else store.similar(pack, it["text"])
                if target is not None:
                    store.reinforce(target.id, run.id, sigs)
                    reinforced.append(target.id)
                else:
                    category = sources[0].kind if sources else "other"
                    added.append(store.add(pack, it["text"], it["when"], it["scope"], category, sigs, run.id).to_dict())
        summary = {"failures": [f.to_dict() for f in failures], "credited": {str(k): v for k, v in credited.items()},
                   "added": added, "reinforced": reinforced, "skipped": skipped}
        ctx.emit(T.REFLECTION, **summary)
        return summary

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

    def _load_rules(self, ctx: RunContext) -> RuleSet:
        if ctx.run.review_mode == "off":
            return RuleSet([])
        try:
            return ctx.session.pack.rules()
        except RuleError as e:  # a typo in rules.yaml should not stop the analysis
            ctx.emit(T.THOUGHT, text=f"领域规则文件有误，本次只做模型审核：{e}")
            return RuleSet([])

    async def _execute(self, ctx: RunContext, system: str, plan: dict[str, Any]) -> str:
        """Single mode: one ReAct loop for the whole plan, then one review of all findings."""
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
        res = await self._react(
            ctx,
            messages,
            self.tools,
            budget=self.settings.max_steps,
            phase="execute",
            nudge=P.NUDGE_NO_FINDINGS if plan.get("answerable", True) else None,
            low_budget=P.STEPS_LOW,
            needs_nudge=lambda: not run.findings.items,
        )
        if res.outcome == "needs_input":
            run.status = "needs_input"
            return ""
        if res.outcome == "budget":
            ctx.emit(T.THOUGHT, text=f"已达到最大步数 {self.settings.max_steps}，基于已有结论生成报告。", step=self.settings.max_steps)
            draft = "（达到最大步数，分析可能不完整）"
        else:
            draft = res.text

        scope = "整个分析：" + "；".join(s.get("title", "") for s in plan.get("steps") or [])
        review = await self._review(ctx, [f.id for f in run.findings.active()], scope, round_no=1, can_redo=True)
        if review.errors and not run.cancelled:
            budget = max(3, min(10, self.settings.max_steps // 4))
            messages.append({"role": "user", "content": P.REVIEW_REDO_SINGLE.format(issues=self._issue_lines(run, review), budget=budget)})
            res = await self._react(ctx, messages, self.tools, budget=budget, phase="redo", nudge=None, low_budget=P.STEPS_LOW,
                                    needs_nudge=lambda: False)
            if res.outcome == "needs_input":
                run.status = "needs_input"
                return ""
            if res.outcome == "answered" and res.text.strip():
                draft += "\n\n审核后的修正：" + res.text.strip()
            review = await self._review(ctx, [f.id for f in run.findings.active()], scope, round_no=2, can_redo=False)
        run.issues = review.issues
        return draft

    async def _execute_multi(self, ctx: RunContext, system: str, plan: dict[str, Any]) -> str:
        """Multi mode: one fresh-context analyst per plan step, coordinated by this code."""
        run = ctx.run
        run.status = "running"
        steps = plan.get("steps") or []
        tools = self.tools.with_tools(SUBMIT_STEP)
        analyst_system = system + "\n\n" + P.ANALYST_ROLE
        budget = self.settings.step_budget
        results: list[dict[str, Any]] = []
        try:
            for index, step in enumerate(steps, 1):
                if run.cancelled:
                    break
                ctx.task, ctx.step_findings = index, []
                usage_before = dict(run.usage)
                ctx.emit(T.STEP_STARTED, title=step.get("title", ""), detail=step.get("detail", ""), role="analyst", total=len(steps))
                variables = await ctx.session.kernel_variables()
                messages = [
                    {"role": "system", "content": analyst_system},
                    {"role": "user", "content": P.handoff(run.question, plan, index, results, run.findings.items, variables, budget)},
                ]
                res = await self._react(
                    ctx,
                    messages,
                    tools,
                    budget=budget,
                    phase="analyst",
                    nudge=P.STEP_NUDGE,
                    low_budget=P.STEPS_LOW_ANALYST,
                    needs_nudge=lambda: True,
                )
                scope = f"第 {index} 步 · {step.get('title', '')}：{step.get('detail', '')}"
                can_redo = res.outcome not in ("needs_input", "cancelled")
                review = await self._review(ctx, ctx.step_findings, scope, round_no=1, can_redo=can_redo)
                redone = False
                if review.errors and can_redo and not run.cancelled:
                    # Back to the same analyst, which still has its context, for one more round.
                    redone = True
                    redo_budget = max(3, budget // 2)
                    messages.append({"role": "user", "content": P.REVIEW_REDO.format(issues=self._issue_lines(run, review), budget=redo_budget)})
                    res2 = await self._react(ctx, messages, tools, budget=redo_budget, phase="redo", nudge=P.STEP_NUDGE,
                                             low_budget=P.STEPS_LOW_ANALYST, needs_nudge=lambda: True)
                    if res2.outcome != "budget":
                        res = res2
                    review = await self._review(ctx, ctx.step_findings, scope, round_no=2, can_redo=False)
                run.issues += review.issues
                result = self._step_result(index, step, res, [f for f in ctx.step_findings if run.findings.get(f).status == "active"])
                results.append(result)
                usage = {k: run.usage[k] - usage_before.get(k, 0) for k in run.usage}
                ctx.emit(T.STEP_FINISHED, **{k: v for k, v in result.items() if k != "index"}, outcome=res.outcome, usage=usage,
                         review={"errors": len(review.errors), "warnings": len(review.warnings), "redone": redone})
                if res.outcome == "needs_input":
                    run.status = "needs_input"
                    break
        finally:
            ctx.task = ctx.step_findings = None
        return P.step_digest(results)

    @staticmethod
    def _step_result(index: int, step: dict[str, Any], res: LoopResult, findings: list[str]) -> dict[str, Any]:
        payload = res.payload
        if res.outcome == "submitted":
            status, summary = payload["status"], payload["summary"]
        elif res.outcome == "answered":
            status = "done" if findings else "partial"
            summary = res.text.strip()[:600] or "（未提交总结）"
        else:
            status = "partial"
            summary = {"budget": "达到本步轮数上限，未提交总结。", "cancelled": "已取消。", "needs_input": "等待用户回答。"}.get(res.outcome, "")
            if findings:
                summary += f"已登记 {len(findings)} 条结论。"
        return {
            "index": index,
            "title": step.get("title", ""),
            "status": status,
            "summary": summary,
            "findings": list(findings),
            "variables": payload.get("variables", []),
            "notes": payload.get("notes", ""),
        }

    async def _react(
        self,
        ctx: RunContext,
        messages: list[dict[str, Any]],
        tools: ToolRegistry,
        budget: int,
        phase: str,
        nudge: str | None,
        low_budget: str,
        needs_nudge,
    ) -> LoopResult:
        """The ReAct loop: think -> call tools -> observe, until the model stops, submits, or runs out of turns."""
        run = ctx.run
        nudged = warned = False
        for step in range(1, budget + 1):
            if run.cancelled:
                return LoopResult("cancelled")
            remaining = budget - step + 1
            if remaining <= 3 and not warned:
                warned = True
                messages.append({"role": "user", "content": low_budget.format(remaining=remaining)})
            _compact(messages)
            resp = await self._call(ctx, messages, phase=phase, tools=tools.schemas(), step=step)
            messages.append(resp.as_message())
            if resp.content.strip() and resp.tool_calls:
                ctx.emit(T.THOUGHT, text=resp.content.strip(), step=step)

            if not resp.tool_calls:
                if nudge and not nudged and needs_nudge():
                    nudged = True
                    messages.append({"role": "user", "content": nudge})
                    continue
                return LoopResult("answered", resp.content)

            for i, call in enumerate(resp.tool_calls):
                text, stop, finish, data = await self._dispatch(ctx, call, step, tools)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": text})
                if stop or finish:
                    # Every tool call needs a result, or the conversation cannot be continued (e.g. after review).
                    for rest in resp.tool_calls[i + 1 :]:
                        messages.append({"role": "tool", "tool_call_id": rest.id, "content": "未执行：本轮已提交或暂停。"})
                    if stop:
                        return LoopResult("needs_input")
                    return LoopResult("submitted", payload=data.get("submitted", {}))
        return LoopResult("budget")

    async def _review(self, ctx: RunContext, finding_ids: list[str], scope: str, round_no: int, can_redo: bool) -> ReviewResult:
        """Rule check, then (in full mode) a fresh-context model review of the given findings."""
        run = ctx.run
        ids = [f for f in finding_ids if run.findings.get(f) and run.findings.get(f).status == "active"]
        if run.review_mode == "off" or not ids or run.cancelled:
            return ReviewResult()
        ctx.emit(T.REVIEW_STARTED, round=round_no, findings=ids)
        result = ReviewResult(R.rule_check(ctx.rules, ctx.session, run, ids))
        if run.review_mode == "full":
            prompt = R.model_prompt(ctx.session, run, ids, scope, result.issues, ctx.rules)
            messages = [{"role": "system", "content": P.REVIEWER_SYSTEM}, {"role": "user", "content": prompt}]
            try:
                resp = await self._call(ctx, messages, phase="review", json_mode=True)
                result.issues += R.parse_model_issues(_parse_json(resp.content), ids)
                result.model_used = True
            except Exception as e:  # noqa: BLE001 - the rule check still stands without the model
                ctx.emit(T.THOUGHT, text=f"审核员调用失败，只保留规则检查结果：{describe_error(e)}")
        action = "final" if round_no > 1 else "redo" if result.errors and can_redo else "accept"
        ctx.emit(T.REVIEW, round=round_no, findings=ids, issues=[i.to_dict() for i in result.issues], errors=len(result.errors),
                 warnings=len(result.warnings), model=result.model_used, action=action)
        return result

    @staticmethod
    def _issue_lines(run: Run, review: ReviewResult) -> str:
        return "\n".join(P.format_issue(i, run.findings) for i in review.issues)

    async def _dispatch(self, ctx: RunContext, call, step: int, tools: ToolRegistry | None = None) -> tuple[str, bool, bool, dict]:
        tools = tools or self.tools
        tool = tools.get(call.name)
        ctx.emit(T.TOOL_CALL, name=call.name, arguments=call.arguments, call_id=call.id, step=step)
        started = time.monotonic()
        stop = finish = False
        data: dict[str, Any] = {}
        if call.parse_error:
            text, ok = f"工具参数解析失败：{call.parse_error}。请重新调用，参数必须是 JSON 对象。", False
        elif tool is None:
            close = difflib.get_close_matches(call.name, tools.names(), n=1, cutoff=0.6)
            hint = f"你是不是想调用 {close[0]}？" if close else ""
            text, ok = f"没有名为 {call.name} 的工具。{hint}可用工具：{', '.join(tools.names())}", False
        else:
            try:
                r = await tool.handler(ctx, call.arguments)
                text, ok, data, stop, finish = r.text, r.ok, r.data, r.stop, r.finish
            except Exception as e:  # noqa: BLE001 - tool failures go back to the model
                text, ok = f"工具执行异常：{type(e).__name__}: {e}", False
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
        return text, stop, finish, data

    async def _report(self, ctx: RunContext, draft: str) -> None:
        run = ctx.run
        run.status = "reporting"
        figures = [
            f"- [{cid}] {o.text}"
            for cid in run.cell_ids
            for o in ctx.session.cells[cid].outputs
            if o.kind == "figure"
        ]
        review = P.format_review_for_report(run.issues, run.findings)
        prompt = P.REPORT.format(
            question=run.question,
            findings=P.format_findings(run.findings.items),
            figures="\n".join(figures) or "（无）",
            draft=draft or "（无）",
            review=review,
        )
        messages = [{"role": "system", "content": "你是严谨的数据分析报告撰写者。"}, {"role": "user", "content": prompt}]
        resp = await self._call(ctx, messages, phase="report")
        report = _strip_fence(resp.content)
        # Thresholds quoted from review issues ("少于 30 年") may appear in the limitations section.
        allowed = [run.question, json.dumps(run.plan or {}, ensure_ascii=False), review]
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
        ctx.emit(T.REPORT, markdown=report, check=run.check, findings=[f.to_dict() for f in run.findings.items],
                 issues=[i.to_dict() for i in run.issues])

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


def describe_error(e: BaseException) -> str:
    """Error text including the underlying causes, e.g. 'APIConnectionError: Connection error.
    ← ConnectError: [Errno 11001] getaddrinfo failed', plus a hint for common setup mistakes."""
    parts, seen = [], set()
    cur: BaseException | None = e
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        parts.append(f"{type(cur).__name__}: {cur}")
        cur = cur.__cause__ or cur.__context__
    text = " ← ".join(parts)
    name = type(e).__name__
    if name == "APIConnectionError":
        text += "（连不上模型服务：请检查 PROVEN_LLM_BASE_URL 是否正确、代理/VPN 设置，可运行 proven doctor 诊断）"
    elif name == "AuthenticationError":
        text += "（API Key 无效或与接口地址不匹配）"
    elif name == "NotFoundError":
        text += "（模型名或接口地址不存在：请检查 PROVEN_LLM_MODEL）"
    return text


def _compact(messages: list[dict[str, Any]]) -> None:
    """Shorten old tool results and old code in place; the full text is always in the trace.

    Messages are only ever shortened once, after they fall out of the recent window, so the prefix of
    the conversation stays stable and providers' prompt caching keeps working."""
    tool_idx = [i for i, m in enumerate(messages) if m["role"] == "tool"]
    if len(tool_idx) <= KEEP_FULL_TOOL_RESULTS:
        return
    boundary = tool_idx[-KEEP_FULL_TOOL_RESULTS]
    for i in tool_idx[:-KEEP_FULL_TOOL_RESULTS]:
        c = messages[i]["content"]
        if len(c) > SHORT_TOOL_RESULT:
            messages[i]["content"] = c[:SHORT_TOOL_RESULT] + "\n...[较早的输出已折叠]"
    for m in messages[:boundary]:
        for tc in m.get("tool_calls") or []:
            fn = tc["function"]
            if len(fn["arguments"]) <= SHORT_CODE:
                continue
            try:
                args = json.loads(fn["arguments"])
            except json.JSONDecodeError:
                continue
            for key in ("code", "sql"):
                if isinstance(args.get(key), str) and len(args[key]) > SHORT_CODE:
                    args[key] = args[key][: SHORT_CODE // 2] + "\n# ...[较早的代码已折叠，变量仍在内核中]"
            fn["arguments"] = json.dumps(args, ensure_ascii=False)


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
