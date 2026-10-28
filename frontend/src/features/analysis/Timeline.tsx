import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Brain,
  ChevronsDownUp,
  ChevronsUpDown,
  Check,
  CircleAlert,
  CircleHelp,
  Database,
  FileSearch,
  History,
  Lightbulb,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  Stamp,
  Terminal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { RunView, TimelineItem } from "../../lib/derive";
import type { Plan } from "../../lib/types";
import { cx, Segmented } from "../../ui/kit";
import { CellView } from "./CellView";
import { IssueRow } from "./IssueRow";

const TOOL_LABEL: Record<string, { label: string; icon: any }> = {
  run_python: { label: "运行代码", icon: Terminal },
  query_sql: { label: "SQL 查询", icon: Database },
  inspect_data: { label: "查看数据", icon: FileSearch },
  lookup_semantic: { label: "查询口径", icon: BookOpen },
  search_knowledge: { label: "检索知识库", icon: BookOpen },
  recall_experience: { label: "查询经验库", icon: History },
  record_finding: { label: "登记结论", icon: Stamp },
  ask_user: { label: "向你提问", icon: CircleHelp },
  submit_step: { label: "提交本步", icon: Check },
};

function PlanEditor({ plan, onApprove, onCancel }: { plan: Plan; onApprove: (p: Plan) => void; onCancel: () => void }) {
  const [steps, setSteps] = useState(plan.steps.map((s) => ({ ...s })));
  const update = (i: number, key: "title" | "detail", v: string) => setSteps(steps.map((s, j) => (j === i ? { ...s, [key]: v } : s)));
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-2">
          <span className="mt-1.5 w-5 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span>
          <div className="flex-1 space-y-1">
            <input value={s.title} onChange={(e) => update(i, "title", e.target.value)} className="w-full rounded border border-line bg-panel px-2 py-1 text-sm font-medium outline-none focus:border-accent" />
            <textarea value={s.detail ?? ""} onChange={(e) => update(i, "detail", e.target.value)} rows={2} className="w-full resize-y rounded border border-line bg-panel px-2 py-1 text-xs text-muted outline-none focus:border-accent" />
          </div>
          <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="mt-1 h-7 rounded p-1 text-faint hover:bg-bad-soft hover:text-bad" title="删除步骤">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => setSteps([...steps, { title: "新步骤", detail: "" }])} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-sunken">
          <Plus size={13} /> 添加步骤
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-sunken">
            取消
          </button>
          <button onClick={() => onApprove({ ...plan, steps })} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90">
            <Check size={15} /> 确认并执行
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ item, onApprove, onCancel }: { item: Extract<TimelineItem, { kind: "plan" }>; onApprove: (p: Plan) => void; onCancel: () => void }) {
  const { plan } = item;
  return (
    <div className={`rounded-xl border bg-panel p-4 ${item.awaiting ? "border-accent shadow-sm" : "border-line"}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ListChecks size={16} className="text-accent" />
        分析计划
        {item.awaiting && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">等待你确认，可以直接修改</span>}
        {item.edited && (
          <span className="flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-xs font-normal text-muted">
            <Pencil size={11} /> 已按你的修改执行
          </span>
        )}
      </div>
      {plan.understanding && <p className="mb-3 text-sm text-muted">{plan.understanding}</p>}
      {plan.answerable === false ? (
        <div className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">现有数据无法回答：{plan.reason}</div>
      ) : item.awaiting ? (
        <PlanEditor plan={plan} onApprove={onApprove} onCancel={onCancel} />
      ) : (
        <ol className="space-y-1.5">
          {plan.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="w-5 shrink-0 text-right tabular-nums text-faint">{i + 1}</span>
              <span>
                <span className="font-medium">{s.title}</span>
                {s.detail && s.detail !== s.title && <span className="text-muted"> · {s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {plan.assumptions && plan.assumptions.length > 0 && (
        <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
          <span className="font-medium">假设：</span>
          {plan.assumptions.join("；")}
        </div>
      )}
    </div>
  );
}

function ToolCard({ item, codeSignal }: { item: Extract<TimelineItem, { kind: "tool" }>; codeSignal: CodeSignal }) {
  const meta = TOOL_LABEL[item.name] ?? { label: item.name, icon: Terminal };
  const Icon = meta.icon;
  const pending = item.ok === undefined;
  const subtitle = item.args.purpose || item.args.query || item.args.question || item.args.table || "";

  // A successful submission is shown in the step header; only a rejected one needs its own card.
  if (item.name === "submit_step" && item.ok !== false) return null;

  if (item.name === "record_finding") {
    const rejected = item.ok === false;
    const retracted = item.finding?.status === "retracted";
    const replaces = String(item.args.replaces ?? "").toUpperCase().trim();
    return (
      <div
        id={item.finding ? `finding-${item.finding.id}` : undefined}
        className={cx("rounded-lg border px-3 py-2 text-sm", rejected ? "border-bad/30 bg-bad-soft" : retracted ? "border-line bg-sunken" : "border-ok/30 bg-ok-soft")}
      >
        <div className="flex items-start gap-2">
          {rejected ? (
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-bad" />
          ) : retracted ? (
            <Undo2 size={16} className="mt-0.5 shrink-0 text-faint" />
          ) : (
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
          )}
          <div className="min-w-0">
            <div>
              {item.finding && <span className={cx("mr-1.5 font-mono text-xs font-semibold", retracted ? "text-faint" : "text-ok")}>{item.finding.id}</span>}
              <span className={rejected || retracted ? "text-muted line-through" : ""}>{item.args.claim}</span>
              <span className="ml-1.5 font-mono text-xs text-faint">← {String(item.args.evidence ?? "").toUpperCase()}</span>
            </div>
            {rejected && <div className="mt-1 text-xs text-bad">{item.text}</div>}
            {retracted && <div className="mt-0.5 text-xs text-faint">审核后已被 {item.finding?.replaced_by} 替换</div>}
            {replaces && !rejected && <div className="mt-0.5 text-xs text-ok">按审核意见更正，替换 {replaces}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${item.ok === false ? "bg-bad-soft text-bad" : "bg-sunken text-muted"}`}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
        </span>
        <span className="font-medium">{meta.label}</span>
        <span className="truncate text-muted">{subtitle}</span>
      </div>
      <div className="ml-8 space-y-2">
        {item.cell && <CellView cell={item.cell} defaultOpen={codeSignal.open || item.cell.error !== null} signal={codeSignal} />}
        {item.hits && (
          <div className="space-y-1.5">
            {item.hits.map((h) => (
              <div key={h.id} id={`chunk-${h.id}`} className="rounded-md border border-line bg-panel px-3 py-2 text-xs">
                <div className="mb-1 flex items-center gap-2 text-faint">
                  <span className="font-mono font-semibold text-accent">{h.id}</span>
                  <span className="truncate">
                    {h.source}
                    {h.page ? ` · 第${h.page}页` : ""}
                    {h.heading ? ` · ${h.heading}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {h.bm25_rank ? `BM25 #${h.bm25_rank}` : ""}
                    {h.vector_rank ? ` · 向量 #${h.vector_rank}` : ""}
                    {h.rerank_score !== null ? ` · 重排 ${h.rerank_score}` : ""}
                  </span>
                </div>
                <p className="line-clamp-4 leading-relaxed text-muted">{h.text}</p>
              </div>
            ))}
          </div>
        )}
        {!item.cell && !item.hits && item.text && item.name !== "ask_user" && (
          <pre className={`max-h-48 overflow-auto whitespace-pre-wrap rounded-md px-3 py-2 font-mono text-xs leading-relaxed scroll-thin ${item.ok === false ? "bg-bad-soft text-bad" : "bg-sunken text-muted"}`}>{item.text}</pre>
        )}
      </div>
    </div>
  );
}

const REVIEW_ACTION: Record<string, { label: string; cls: string }> = {
  redo: { label: "退回重做", cls: "bg-bad-soft text-bad" },
  accept: { label: "通过", cls: "bg-ok-soft text-ok" },
  final: { label: "复审完成", cls: "bg-accent-soft text-accent" },
};

function ReviewCard({ item }: { item: Extract<TimelineItem, { kind: "review" }> }) {
  const act = item.action ? REVIEW_ACTION[item.action] : null;
  const issues = item.issues ?? [];
  return (
    <div className={cx("rounded-xl border px-4 py-3", item.action === "redo" ? "border-bad/30" : "border-line", "bg-panel")}>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ScanSearch size={14} />
        </span>
        <span className="font-semibold">审核员 · 第 {item.round} 轮</span>
        <span className="text-xs text-faint">
          {item.action ? (item.model ? "领域规则 + 模型审核" : "领域规则") : `检查 ${item.findings.join("、")}`}
        </span>
        {act ? <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${act.cls}`}>{act.label}</span> : <Loader2 size={14} className="ml-auto animate-spin text-accent" />}
      </div>
      {item.action && (
        <div className="ml-8 mt-2 space-y-1.5">
          {issues.length === 0 ? (
            <p className="text-xs text-ok">{item.findings.join("、")} 未发现问题</p>
          ) : (
            issues.map((i, k) => <IssueRow key={k} issue={i} />)
          )}
          {item.action === "redo" && <p className="pt-0.5 text-xs text-muted">有错误级问题，已带着审核意见退回{item.task ? "本步分析员" : "分析"}重做一次。</p>}
          {item.action === "final" && issues.some((i) => i.severity === "error") && (
            <p className="pt-0.5 text-xs text-bad">重做后仍有未解决的错误，报告中会注明，相关结论不作为确定结论。</p>
          )}
        </div>
      )}
    </div>
  );
}

const STEP_STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "完成", cls: "bg-ok-soft text-ok" },
  partial: { label: "部分完成", cls: "bg-warn-soft text-warn" },
  blocked: { label: "未能完成", cls: "bg-bad-soft text-bad" },
};

function StepHeader({ item }: { item: Extract<TimelineItem, { kind: "step" }> }) {
  const st = item.status ? STEP_STATUS[item.status] : null;
  return (
    <div id={`step-${item.task}`} className="mt-2 scroll-mt-14 rounded-xl border border-line bg-sunken/60 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Bot size={14} />
        </span>
        <span className="font-semibold">
          第 {item.task}/{item.total} 步 · {item.title}
        </span>
        <span className="text-xs text-faint">分析员 · 全新上下文</span>
        {st ? (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
        ) : (
          <Loader2 size={14} className="ml-auto animate-spin text-accent" />
        )}
      </div>
      {item.detail && !item.summary && <p className="ml-8 mt-1 text-xs text-muted">{item.detail}</p>}
      {item.summary && (
        <div className="ml-8 mt-1.5 space-y-0.5 text-xs text-muted">
          <p className="text-ink">{item.summary}</p>
          <p>
            结论 {item.findings?.length ? item.findings.join("、") : "无"}
            {item.variables?.length ? ` · 交接变量 ${item.variables.join("、")}` : ""}
            {item.tokens ? ` · ${item.tokens.toLocaleString()} tokens` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export type CodeSignal = { open: boolean; nonce: number };
export type TimelineFilter = "all" | "code" | "findings" | "retrieval" | "errors";

const RETRIEVAL_TOOLS = new Set(["search_knowledge", "lookup_semantic", "recall_experience", "inspect_data"]);

function visible(item: TimelineItem, filter: TimelineFilter, showReasoning: boolean): boolean {
  if (item.kind === "reasoning") return showReasoning && filter === "all";
  if (["plan", "step", "ask"].includes(item.kind)) return true;
  switch (filter) {
    case "all":
      return true;
    case "code":
      return item.kind === "tool" && !!item.cell;
    case "findings":
      return (item.kind === "tool" && item.name === "record_finding") || item.kind === "check" || item.kind === "review";
    case "retrieval":
      return item.kind === "tool" && RETRIEVAL_TOOLS.has(item.name);
    case "errors":
      return (
        (item.kind === "tool" && item.ok === false) ||
        (item.kind === "finished" && item.status === "error") ||
        (item.kind === "check" && !item.check.ok) ||
        (item.kind === "review" && (item.issues?.length ?? 0) > 0)
      );
  }
}

function Reasoning({ text, phase }: { text: string; phase: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-left">
        <Brain size={13} className="text-accent" />
        模型思考过程（{phase}）{!open && <span className="ml-1 truncate text-faint">{text.slice(0, 60)}…</span>}
      </button>
      {open && <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{text}</p>}
    </div>
  );
}

function StepNav({ steps }: { steps: Extract<TimelineItem, { kind: "step" }>[] }) {
  if (steps.length === 0) return null;
  const tone: Record<string, string> = { done: "text-ok", partial: "text-warn", blocked: "text-bad" };
  return (
    <div className="flex gap-1 overflow-x-auto scroll-thin">
      {steps.map((s) => (
        <button
          key={s.key}
          onClick={() => document.getElementById(`step-${s.task}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs hover:border-accent"
          title={s.summary ?? s.detail}
        >
          <span className={cx("font-semibold tabular-nums", s.status ? tone[s.status] : "text-accent")}>{s.task}</span>
          <span className="max-w-28 truncate">{s.title}</span>
          {!s.status && <Loader2 size={11} className="animate-spin text-accent" />}
        </button>
      ))}
    </div>
  );
}

export function Timeline({
  view,
  focus,
  onApprove,
  onCancel,
  showReasoning,
  autoScroll,
  codeOpenByDefault,
}: {
  view: RunView;
  focus: { id: string; nonce: number } | null;
  onApprove: (p: Plan) => void;
  onCancel: () => void;
  showReasoning: boolean;
  autoScroll: boolean;
  codeOpenByDefault: boolean;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [codeSignal, setCodeSignal] = useState<CodeSignal>({ open: codeOpenByDefault, nonce: 0 });

  useEffect(() => {
    if (autoScroll && stick && !focus && filter === "all") bottom.current?.scrollIntoView({ block: "end" });
  }, [view.items.length, stick, focus, autoScroll, filter]);

  useEffect(() => {
    if (!focus) return;
    setFilter("all");
    setTimeout(() => {
      const el = document.getElementById(focus.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
      }
    }, 30);
  }, [focus]);

  const running = !["done", "error", "cancelled", "needs_input"].includes(view.status);
  const steps = view.items.filter((i): i is Extract<TimelineItem, { kind: "step" }> => i.kind === "step");
  const errors = view.items.filter((i) => visible(i, "errors", false) && !["plan", "step", "ask"].includes(i.kind)).length;
  const items = view.items.filter((i) => visible(i, filter, showReasoning));

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel/80 px-4 py-2 backdrop-blur">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部" },
            { value: "code", label: "代码" },
            { value: "findings", label: "结论" },
            { value: "retrieval", label: "检索" },
            { value: "errors", label: errors ? `问题 ${errors}` : "问题" },
          ]}
        />
        <button onClick={() => setCodeSignal((c) => ({ open: !c.open, nonce: c.nonce + 1 }))} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-sunken hover:text-ink">
          {codeSignal.open ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {codeSignal.open ? "收起全部代码" : "展开全部代码"}
        </button>
        <span className="ml-auto text-xs text-faint">
          {view.mode === "multi" ? "多 Agent" : "单 Agent"}
          {view.reviewMode !== "off" ? ` · 审核${view.reviewMode === "full" ? "（规则 + 模型）" : "（规则）"}` : ""} · {view.usage.llm_calls} 次调用
        </span>
        {steps.length > 0 && (
          <div className="w-full">
            <StepNav steps={steps} />
          </div>
        )}
      </div>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scroll-thin sm:px-6"
      >
        <div className="tl mx-auto max-w-3xl">
          <div className="text-lg font-semibold leading-snug">{view.question}</div>
          {items.map((item) => {
            switch (item.kind) {
              case "plan":
                return <PlanCard key={item.key} item={item} onApprove={onApprove} onCancel={onCancel} />;
              case "step":
                return <StepHeader key={item.key} item={item} />;
              case "review":
                return <ReviewCard key={item.key} item={item} />;
              case "reasoning":
                return <Reasoning key={item.key} text={item.text} phase={item.phase} />;
              case "thought":
                return (
                  <div key={item.key} className="flex gap-2 text-sm text-muted">
                    <Lightbulb size={15} className="mt-0.5 shrink-0 text-warn" />
                    <p className="leading-relaxed">{item.text}</p>
                  </div>
                );
              case "tool":
                return <ToolCard key={item.key} item={item} codeSignal={codeSignal} />;
              case "ask":
                return (
                  <div key={item.key} className="rounded-xl border border-accent bg-accent-soft p-4 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold text-accent">
                      <CircleHelp size={16} /> 需要你补充信息
                    </div>
                    <p>{item.question}</p>
                    {item.options.length > 0 && <p className="mt-1 text-muted">可选：{item.options.join(" / ")}</p>}
                    <p className="mt-2 text-xs text-muted">在下方输入框中回答，Agent 会接着分析。</p>
                  </div>
                );
              case "check":
                return (
                  <div key={item.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${item.check.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                    {item.check.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                    <span>
                      报告数字核查（第 {item.check.attempt} 次）：检查 {item.check.checked} 个数字，
                      {item.check.ok ? "全部可溯源" : `${item.check.unsupported.length} 个没有来源${item.check.attempt === 1 ? "，已退回重写" : ""}`}
                    </span>
                  </div>
                );
              case "finished":
                return item.status === "error" ? (
                  <div key={item.key} className="flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
                    <CircleAlert size={16} className="mt-0.5 shrink-0" />
                    <span>分析出错：{item.error}</span>
                  </div>
                ) : item.status === "cancelled" ? (
                  <div key={item.key} className="flex items-center gap-2 text-sm text-muted">
                    <X size={15} /> 已取消
                  </div>
                ) : null;
            }
          })}
          {filter !== "all" && items.length === 0 && <div className="py-8 text-center text-sm text-faint">这一类暂时没有内容</div>}
          {running && !view.awaitingApproval && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={15} className="animate-spin text-accent" />
              {view.phase || "处理中"}…
            </div>
          )}
          <div ref={bottom} className="h-4" />
        </div>
      </div>
    </div>
  );
}
