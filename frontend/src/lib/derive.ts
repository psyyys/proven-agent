import type { AgentEvent, Cell, Failure, Finding, Hit, Lesson, Plan, ReportCheck, ReviewIssue } from "./types";

export type TimelineItem =
  | { kind: "plan"; key: string; plan: Plan; awaiting: boolean; approved: boolean; edited: boolean }
  | { kind: "thought"; key: string; text: string }
  | { kind: "reasoning"; key: string; text: string; phase: string }
  | {
      kind: "step";
      key: string;
      task: number;
      total: number;
      title: string;
      detail: string;
      status?: string;
      summary?: string;
      findings?: string[];
      variables?: string[];
      tokens?: number;
    }
  | {
      kind: "tool";
      key: string;
      name: string;
      args: Record<string, any>;
      ok?: boolean;
      text?: string;
      data?: Record<string, any>;
      cell?: Cell;
      hits?: Hit[];
      finding?: Finding;
      durationMs?: number;
    }
  | { kind: "ask"; key: string; question: string; options: string[] }
  | { kind: "lessons"; key: string; lessons: Lesson[] }
  | {
      kind: "reflection";
      key: string;
      done: boolean;
      failures: Failure[];
      credited: Record<string, string>;
      added: Lesson[];
      reinforced: number[];
      skipped: string[];
    }
  | {
      kind: "review";
      key: string;
      round: number;
      task: number | null;
      findings: string[];
      issues?: ReviewIssue[];
      errors?: number;
      warnings?: number;
      model?: boolean;
      action?: "redo" | "accept" | "final";
    }
  | { kind: "check"; key: string; check: ReportCheck & { attempt: number } }
  | { kind: "finished"; key: string; status: string; error?: string };

export interface RunView {
  status: string;
  question: string;
  plan: Plan | null;
  awaitingApproval: boolean;
  items: TimelineItem[];
  cells: Record<string, Cell>;
  findings: Finding[];
  report: string;
  check: ReportCheck | null;
  /** Open review issues: the latest review of each step (or of the whole run in single mode). */
  issues: ReviewIssue[];
  reviewMode: string;
  lessonsMode: string;
  usage: { input_tokens: number; output_tokens: number; llm_calls: number };
  phase: string;
  error?: string;
  mode: string;
  startedAt: number | null;
  finishedAt: number | null;
  calls: { phase: string; task: number | null; input: number; output: number; ms: number }[];
  toolStats: Record<string, { calls: number; failed: number }>;
}

export function deriveRun(events: AgentEvent[]): RunView {
  const view: RunView = {
    status: "running",
    question: "",
    plan: null,
    awaitingApproval: false,
    items: [],
    cells: {},
    findings: [],
    report: "",
    check: null,
    issues: [],
    reviewMode: "off",
    lessonsMode: "off",
    usage: { input_tokens: 0, output_tokens: 0, llm_calls: 0 },
    phase: "思考中",
    mode: "single",
    startedAt: null,
    finishedAt: null,
    calls: [],
    toolStats: {},
  };
  const tools = new Map<string, Extract<TimelineItem, { kind: "tool" }>>();
  const latestReview = new Map<number, ReviewIssue[]>(); // task (0 = single mode) -> issues
  let openTool: Extract<TimelineItem, { kind: "tool" }> | null = null;

  for (const e of events) {
    const d = e.data;
    switch (e.type) {
      case "run.started":
        view.question = d.question;
        view.mode = d.mode ?? "single";
        view.reviewMode = d.review ?? "off";
        view.lessonsMode = d.lessons ?? "off";
        view.startedAt = e.ts;
        view.phase = "制定计划";
        break;
      case "llm.call":
        if (d.reasoning) view.items.push({ kind: "reasoning", key: e.id, text: d.reasoning, phase: d.phase });
        view.calls.push({ phase: d.phase, task: d.task ?? null, input: d.usage?.input_tokens ?? 0, output: d.usage?.output_tokens ?? 0, ms: d.duration_ms ?? 0 });
        view.usage.llm_calls += 1;
        view.usage.input_tokens += d.usage?.input_tokens ?? 0;
        view.usage.output_tokens += d.usage?.output_tokens ?? 0;
        if (d.phase === "execute") view.phase = "分析中";
        if (d.phase === "analyst" && !view.phase.startsWith("第")) view.phase = "分析中";
        if (d.phase === "report" || d.phase === "report_fix") view.phase = "核查报告";
        if (d.phase === "redo") view.phase = "按审核意见修正";
        if (d.phase === "reflect") view.phase = "反思员总结教训";
        break;
      case "plan.proposed":
        view.plan = d.plan;
        view.awaitingApproval = !!d.awaiting_approval;
        view.phase = d.awaiting_approval ? "等待确认计划" : "分析中";
        view.items.push({ kind: "plan", key: e.id, plan: d.plan, awaiting: !!d.awaiting_approval, approved: !d.awaiting_approval, edited: false });
        break;
      case "plan.approved": {
        view.plan = d.plan;
        view.awaitingApproval = false;
        view.phase = "分析中";
        const p = view.items.find((i) => i.kind === "plan") as Extract<TimelineItem, { kind: "plan" }> | undefined;
        if (p) Object.assign(p, { plan: d.plan, awaiting: false, approved: true, edited: d.edited });
        break;
      }
      case "step.started":
        view.phase = `第 ${d.task}/${d.total} 步 · ${d.title}`;
        view.items.push({ kind: "step", key: e.id, task: d.task, total: d.total, title: d.title, detail: d.detail });
        break;
      case "step.finished": {
        const st = view.items.find((i) => i.kind === "step" && i.task === d.task) as Extract<TimelineItem, { kind: "step" }> | undefined;
        if (st)
          Object.assign(st, {
            status: d.status,
            summary: d.summary,
            findings: d.findings,
            variables: d.variables,
            tokens: (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0),
          });
        break;
      }
      case "agent.thought":
        view.items.push({ kind: "thought", key: e.id, text: d.text });
        break;
      case "tool.call": {
        const item = { kind: "tool" as const, key: e.id, name: d.name, args: d.arguments ?? {} };
        tools.set(d.call_id, item);
        openTool = item;
        view.items.push(item);
        break;
      }
      case "cell.executed": {
        const cell: Cell = { ...d };
        view.cells[cell.cell_id] = cell;
        if (openTool) openTool.cell = cell;
        break;
      }
      case "retrieval":
        if (openTool) openTool.hits = d.hits;
        break;
      case "finding.recorded":
        view.findings.push(d as Finding);
        if (openTool) openTool.finding = d as Finding;
        break;
      case "tool.result": {
        const stat = (view.toolStats[d.name] ??= { calls: 0, failed: 0 });
        stat.calls += 1;
        if (!d.ok) stat.failed += 1;
        const t = tools.get(d.call_id);
        if (t) Object.assign(t, { ok: d.ok, text: d.text, data: d.data, durationMs: d.duration_ms });
        openTool = null;
        break;
      }
      case "review.started":
        view.phase = d.round > 1 ? "复审中" : "审核中";
        view.items.push({ kind: "review", key: e.id, round: d.round, task: d.task ?? null, findings: d.findings ?? [] });
        break;
      case "review.result": {
        const open = [...view.items]
          .reverse()
          .find((i) => i.kind === "review" && i.round === d.round && i.task === (d.task ?? null) && !i.action) as
          | Extract<TimelineItem, { kind: "review" }>
          | undefined;
        const data = { issues: d.issues, errors: d.errors, warnings: d.warnings, model: d.model, action: d.action };
        if (open) Object.assign(open, data);
        else view.items.push({ kind: "review", key: e.id, round: d.round, task: d.task ?? null, findings: d.findings ?? [], ...data });
        latestReview.set(d.task ?? 0, d.issues ?? []);
        view.issues = [...latestReview.values()].flat();
        break;
      }
      case "lessons.injected":
        view.items.push({ kind: "lessons", key: e.id, lessons: d.lessons ?? [] });
        break;
      case "reflection.started":
        view.phase = "反思中";
        view.items.push({ kind: "reflection", key: e.id, done: false, failures: [], credited: {}, added: [], reinforced: [], skipped: [] });
        break;
      case "reflection.result": {
        const open = [...view.items].reverse().find((i) => i.kind === "reflection" && !i.done) as Extract<TimelineItem, { kind: "reflection" }> | undefined;
        const data = { done: true, failures: d.failures ?? [], credited: d.credited ?? {}, added: d.added ?? [], reinforced: d.reinforced ?? [], skipped: d.skipped ?? [] };
        if (open) Object.assign(open, data);
        else view.items.push({ kind: "reflection", key: e.id, ...data });
        break;
      }
      case "finding.retracted": {
        const f = view.findings.find((x) => x.id === d.id);
        if (f) Object.assign(f, { status: "retracted", replaced_by: d.replaced_by });
        break;
      }
      case "agent.ask_user":
        view.items.push({ kind: "ask", key: e.id, question: d.question, options: d.options ?? [] });
        break;
      case "report.check":
        view.items.push({ kind: "check", key: e.id, check: d });
        break;
      case "report.final":
        view.report = d.markdown;
        view.check = d.check;
        if (d.issues) view.issues = d.issues;
        break;
      case "run.finished":
        view.finishedAt = e.ts;
        view.status = d.status;
        view.error = d.error;
        view.phase = "";
        view.awaitingApproval = false;
        view.items.push({ kind: "finished", key: e.id, status: d.status, error: d.error });
        break;
    }
  }
  return view;
}

export function figuresOf(view: RunView): { cellId: string; fig: any; title: string }[] {
  const out: { cellId: string; fig: any; title: string }[] = [];
  for (const cell of Object.values(view.cells)) {
    for (const o of cell.outputs) {
      if (o.kind === "figure") out.push({ cellId: cell.cell_id, fig: o.data, title: o.data?.layout?.title?.text ?? cell.purpose ?? cell.cell_id });
    }
  }
  return out;
}
