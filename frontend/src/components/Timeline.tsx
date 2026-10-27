import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
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
  ShieldCheck,
  ShieldAlert,
  Stamp,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type { RunView, TimelineItem } from "../derive";
import type { Plan } from "../types";
import { CellView } from "./CellView";

const TOOL_LABEL: Record<string, { label: string; icon: any }> = {
  run_python: { label: "运行代码", icon: Terminal },
  query_sql: { label: "SQL 查询", icon: Database },
  inspect_data: { label: "查看数据", icon: FileSearch },
  lookup_semantic: { label: "查询口径", icon: BookOpen },
  search_knowledge: { label: "检索知识库", icon: BookOpen },
  recall_experience: { label: "查询经验库", icon: History },
  record_finding: { label: "登记结论", icon: Stamp },
  ask_user: { label: "向你提问", icon: CircleHelp },
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
          <button onClick={() => onApprove({ ...plan, steps })} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 dark:text-black">
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

function ToolCard({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  const meta = TOOL_LABEL[item.name] ?? { label: item.name, icon: Terminal };
  const Icon = meta.icon;
  const pending = item.ok === undefined;
  const subtitle = item.args.purpose || item.args.query || item.args.question || item.args.table || "";

  if (item.name === "record_finding") {
    const rejected = item.ok === false;
    return (
      <div id={item.finding ? `finding-${item.finding.id}` : undefined} className={`rounded-lg border px-3 py-2 text-sm ${rejected ? "border-bad/30 bg-bad-soft" : "border-ok/30 bg-ok-soft"}`}>
        <div className="flex items-start gap-2">
          {rejected ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-bad" /> : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />}
          <div className="min-w-0">
            <div>
              {item.finding && <span className="mr-1.5 font-mono text-xs font-semibold text-ok">{item.finding.id}</span>}
              <span className={rejected ? "text-muted line-through" : ""}>{item.args.claim}</span>
              <span className="ml-1.5 font-mono text-xs text-faint">← {String(item.args.evidence ?? "").toUpperCase()}</span>
            </div>
            {rejected && <div className="mt-1 text-xs text-bad">{item.text}</div>}
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
        {item.cell && <CellView cell={item.cell} defaultOpen={item.cell.error !== null} />}
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

export function Timeline({
  view,
  focus,
  onApprove,
  onCancel,
}: {
  view: RunView;
  focus: { id: string; nonce: number } | null;
  onApprove: (p: Plan) => void;
  onCancel: () => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stick && !focus) bottom.current?.scrollIntoView({ block: "end" });
  }, [view.items.length, stick, focus]);

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }, [focus]);

  const running = !["done", "error", "cancelled", "needs_input"].includes(view.status);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
      }}
      className="h-full overflow-y-auto px-6 py-5 scroll-thin"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="text-lg font-semibold leading-snug">{view.question}</div>
        {view.items.map((item) => {
          switch (item.kind) {
            case "plan":
              return <PlanCard key={item.key} item={item} onApprove={onApprove} onCancel={onCancel} />;
            case "thought":
              return (
                <div key={item.key} className="flex gap-2 text-sm text-muted">
                  <Lightbulb size={15} className="mt-0.5 shrink-0 text-warn" />
                  <p className="leading-relaxed">{item.text}</p>
                </div>
              );
            case "tool":
              return <ToolCard key={item.key} item={item} />;
            case "ask":
              return (
                <div key={item.key} className="rounded-xl border border-accent bg-accent-soft p-4 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-semibold text-accent">
                    <CircleHelp size={16} /> 需要你补充信息
                  </div>
                  <p>{item.question}</p>
                  {item.options.length > 0 && <p className="mt-1 text-muted">可选：{item.options.join(" / ")}</p>}
                  <p className="mt-2 text-xs text-muted">请在左下角输入框中回答，Agent 会接着分析。</p>
                </div>
              );
            case "check":
              return (
                <div key={item.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${item.check.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                  {item.check.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                  <span>
                    报告数字核查（第 {item.check.attempt} 次）：检查 {item.check.checked} 个数字，
                    {item.check.ok
                      ? "全部可溯源"
                      : `${item.check.unsupported.length} 个没有来源${item.check.attempt === 1 ? "，已退回重写" : ""}`}
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
        {running && !view.awaitingApproval && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} className="animate-spin text-accent" />
            {view.phase || "处理中"}…
          </div>
        )}
        <div ref={bottom} className="h-4" />
      </div>
    </div>
  );
}
