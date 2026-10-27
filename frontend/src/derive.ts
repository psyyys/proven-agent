import type { AgentEvent, Cell, Finding, Hit, Plan, ReportCheck } from "./types";

export type TimelineItem =
  | { kind: "plan"; key: string; plan: Plan; awaiting: boolean; approved: boolean; edited: boolean }
  | { kind: "thought"; key: string; text: string }
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
  usage: { input_tokens: number; output_tokens: number; llm_calls: number };
  phase: string;
  error?: string;
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
    usage: { input_tokens: 0, output_tokens: 0, llm_calls: 0 },
    phase: "思考中",
  };
  const tools = new Map<string, Extract<TimelineItem, { kind: "tool" }>>();
  let openTool: Extract<TimelineItem, { kind: "tool" }> | null = null;

  for (const e of events) {
    const d = e.data;
    switch (e.type) {
      case "run.started":
        view.question = d.question;
        view.phase = "制定计划";
        break;
      case "llm.call":
        view.usage.llm_calls += 1;
        view.usage.input_tokens += d.usage?.input_tokens ?? 0;
        view.usage.output_tokens += d.usage?.output_tokens ?? 0;
        if (d.phase === "execute") view.phase = "分析中";
        if (d.phase === "analyst" && !view.phase.startsWith("第")) view.phase = "分析中";
        if (d.phase === "report" || d.phase === "report_fix") view.phase = "核查报告";
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
        const t = tools.get(d.call_id);
        if (t) Object.assign(t, { ok: d.ok, text: d.text, data: d.data, durationMs: d.duration_ms });
        openTool = null;
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
        break;
      case "run.finished":
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
