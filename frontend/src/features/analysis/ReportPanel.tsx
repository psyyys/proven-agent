import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Activity, BadgeCheck, BarChart3, Copy, Download, FileText, Loader2, ScanSearch, ShieldAlert, ShieldCheck, Stamp, ThumbsUp } from "lucide-react";
import { figuresOf, type RunView } from "../../lib/derive";
import type { Finding, ReviewIssue } from "../../lib/types";
import { Bar, cx, IconButton, Tabs } from "../../ui/kit";
import { Plot } from "../../ui/Plot";
import { IssueRow } from "./IssueRow";

type Tab = "report" | "findings" | "charts" | "usage";

const PHASE_LABEL: Record<string, string> = {
  plan: "规划",
  execute: "执行",
  analyst: "分析员",
  report: "撰写报告",
  report_fix: "报告修订",
  review: "审核员",
  redo: "按审核意见修正",
};

const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

function UsagePanel({ view }: { view: RunView }) {
  const total = view.usage.input_tokens + view.usage.output_tokens;
  const seconds = view.startedAt && view.finishedAt ? Math.round(view.finishedAt - view.startedAt) : null;
  // group calls by step (multi mode) or by phase
  const groups = new Map<string, { label: string; tokens: number; calls: number; ms: number }>();
  const stepTitles = Object.fromEntries(view.items.filter((i) => i.kind === "step").map((i: any) => [i.task, i.title]));
  for (const c of view.calls) {
    const key = c.task ? `step-${c.task}` : c.phase;
    const label = c.task ? `第 ${c.task} 步 · ${stepTitles[c.task] ?? ""}` : (PHASE_LABEL[c.phase] ?? c.phase);
    const g = groups.get(key) ?? { label, tokens: 0, calls: 0, ms: 0 };
    g.tokens += c.input + c.output;
    g.calls += 1;
    g.ms += c.ms;
    groups.set(key, g);
  }
  const rows = [...groups.values()];
  const maxTokens = Math.max(1, ...rows.map((r) => r.tokens));
  const tools = Object.entries(view.toolStats).sort((a, b) => b[1].calls - a[1].calls);
  const maxCalls = Math.max(1, ...tools.map(([, t]) => t.calls));
  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="text-xs text-faint">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {stat("模型调用", String(view.usage.llm_calls))}
        {stat("总 Token", total.toLocaleString())}
        {stat("输入 / 输出", `${kfmt(view.usage.input_tokens)} / ${kfmt(view.usage.output_tokens)}`)}
        {stat("耗时", seconds !== null ? `${seconds} 秒` : "进行中")}
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-faint">{view.mode === "multi" ? "各步骤 Token" : "各阶段 Token"}</div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {r.tokens.toLocaleString()} · {r.calls} 次 · {(r.ms / 1000).toFixed(1)}s
                </span>
              </div>
              <Bar value={r.tokens} max={maxTokens} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-faint">工具调用</div>
        <div className="space-y-2">
          {tools.map(([name, t]) => (
            <div key={name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-mono">{name}</span>
                <span className={t.failed ? "text-bad" : "text-muted"}>
                  {t.calls} 次{t.failed ? ` · 失败 ${t.failed}` : ""}
                </span>
              </div>
              <Bar value={t.calls} max={maxCalls} tone={t.failed ? "warn" : "accent"} />
            </div>
          ))}
          {tools.length === 0 && <div className="text-xs text-faint">还没有工具调用</div>}
        </div>
      </div>
    </div>
  );
}

/** Turn [F1] citations, standalone [C5] chart lines and unsupported numbers into markdown links the
 *  renderer below understands. Unsupported spans are rewritten first (from the end) so offsets hold. */
function prepare(markdown: string, view: RunView): string {
  let md = markdown;
  const bad = [...(view.check?.unsupported ?? [])].sort((a, b) => b.start - a.start);
  bad.forEach((u, i) => {
    md = md.slice(0, u.start) + `[${md.slice(u.start, u.end)}](#unsupported-${i})` + md.slice(u.end);
  });
  md = md.replace(/^\s*\[(C\d+)\]\s*$/gm, (_, id) => `\n![chart](#chart-${id})\n`);
  md = md.replace(/\[((?:F\d+)(?:\s*[,，]\s*F\d+)*)\](?!\()/g, (_, ids: string) =>
    ids
      .split(/\s*[,，]\s*/)
      .map((id) => `[${id}](#finding-${id})`)
      .join(""),
  );
  return md;
}

function FindingChip({ finding, issues, onClick }: { finding?: Finding; issues: ReviewIssue[]; onClick: () => void }) {
  const retracted = finding?.status === "retracted";
  const tone = !finding || retracted || issues.some((i) => i.severity === "error") ? "bad" : issues.length ? "warn" : "ok";
  const notes = issues.map((i) => `${i.rule_id || "审核员"}：${i.rule_id ? i.name : i.message}`);
  const title = !finding
    ? "未知结论"
    : [finding.claim, `证据：${finding.evidence_id}`, retracted ? `审核后已被 ${finding.replaced_by} 替换` : "", ...notes].filter(Boolean).join("\n");
  const tones = {
    ok: "bg-ok-soft text-ok hover:ring-1 hover:ring-ok",
    warn: "bg-warn-soft text-warn hover:ring-1 hover:ring-warn",
    bad: "bg-bad-soft text-bad",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx("mx-0.5 inline-flex items-center rounded px-1 align-baseline font-mono text-[0.7rem] font-semibold leading-tight", tones[tone], retracted && "line-through")}
    >
      {finding?.id ?? "?"}
      {issues.length > 0 && !retracted && <sup className="ml-px">!</sup>}
    </button>
  );
}

function ReviewSummary({ view }: { view: RunView }) {
  const errors = view.issues.filter((i) => i.severity === "error").length;
  const warnings = view.issues.length - errors;
  const replaced = view.findings.filter((f) => f.status === "retracted").length;
  if (view.reviewMode === "off") return <div className="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">本次分析没有开启审核员（设置 → 运行参数 → 审核）。</div>;
  return (
    <div className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-xs", errors ? "bg-bad-soft text-bad" : warnings ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
      <ScanSearch size={15} className="mt-px shrink-0" />
      <span>
        审核员（{view.reviewMode === "full" ? "领域规则 + 模型审核" : "领域规则"}）：
        {errors || warnings ? `${errors ? `${errors} 个未解决的错误，` : ""}${warnings} 条警告（已写入报告的"假设与局限"）` : "未发现问题"}
        {replaced ? `；${replaced} 条结论按审核意见更正` : ""}
      </span>
    </div>
  );
}

export function ReportPanel({
  view,
  onFocus,
  onVerify,
  verified,
  onNotify,
}: {
  view: RunView | null;
  onFocus: (domId: string) => void;
  onVerify: () => void;
  verified: boolean;
  onNotify?: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("report");
  const figures = useMemo(() => (view ? figuresOf(view) : []), [view]);
  const findingsById = useMemo(() => Object.fromEntries((view?.findings ?? []).map((f) => [f.id, f])), [view]);
  const issuesOf = useMemo(() => {
    const m: Record<string, ReviewIssue[]> = {};
    for (const i of view?.issues ?? []) (m[i.finding_id] ??= []).push(i);
    return (id: string) => m[id] ?? [];
  }, [view]);
  const activeFindings = view?.findings.filter((f) => f.status !== "retracted").length ?? 0;
  const md = useMemo(() => (view?.report ? prepare(view.report, view) : ""), [view]);

  const focusFinding = (f?: Finding) => {
    if (!f) return;
    const first = f.evidence_id.split(",")[0];
    onFocus(first.startsWith("C") ? `cell-${first}` : `chunk-${first}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view?.report ?? "");
      onNotify?.("报告已复制（Markdown）");
    } catch {
      onNotify?.("浏览器不允许访问剪贴板");
    }
  };
  const download = () => {
    const blob = new Blob([view?.report ?? ""], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proven-report.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end border-b border-line px-2 pt-1">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "report", label: "报告", icon: <FileText size={15} /> },
            { id: "findings", label: "结论", icon: <Stamp size={15} />, count: activeFindings },
            { id: "charts", label: "图表", icon: <BarChart3 size={15} />, count: figures.length },
            { id: "usage", label: "用量", icon: <Activity size={15} /> },
          ]}
        />
        {view?.report && tab === "report" && (
          <div className="mb-1 ml-auto flex">
            <IconButton label="复制 Markdown" onClick={copy}>
              <Copy size={15} />
            </IconButton>
            <IconButton label="下载报告（.md）" onClick={download}>
              <Download size={15} />
            </IconButton>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">
        {!view ? (
          <Empty text="提问后，报告会显示在这里。报告中的每个数字都可以点击，跳转到产生它的代码。" />
        ) : tab === "report" ? (
          view.report ? (
            <div className="report text-[0.93rem]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(u) => u}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith("#finding-")) {
                      const f = findingsById[href.slice(9)];
                      return <FindingChip finding={f} issues={f ? issuesOf(f.id) : []} onClick={() => focusFinding(f)} />;
                    }
                    if (href?.startsWith("#unsupported-")) {
                      return (
                        <mark title="这个数字没有对应的已登记结论，未通过核查" className="rounded bg-bad-soft px-0.5 text-bad underline decoration-wavy">
                          {children}
                        </mark>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
                        {children}
                      </a>
                    );
                  },
                  img: ({ src }) => {
                    const id = String(src ?? "").replace("#chart-", "");
                    const fig = figures.find((f) => f.cellId === id);
                    if (!fig) return null;
                    return (
                      <span className="my-3 block rounded-lg border border-line p-2">
                        <Plot fig={fig.fig} height={300} />
                        <button onClick={() => onFocus(`cell-${id}`)} className="mt-1 block text-xs text-faint hover:text-accent">
                          来源：{id}
                        </button>
                      </span>
                    );
                  },
                }}
              >
                {md}
              </ReactMarkdown>
            </div>
          ) : (
            <Empty text={view.status === "error" ? "分析出错，没有生成报告。" : "分析进行中，报告会在核查后显示。"} spinning={view.status !== "error"} />
          )
        ) : tab === "usage" ? (
          <UsagePanel view={view} />
        ) : tab === "findings" ? (
          view.findings.length ? (
            <div className="space-y-2">
              <ReviewSummary view={view} />
              {view.findings.map((f) => {
                const retracted = f.status === "retracted";
                const issues = retracted ? [] : issuesOf(f.id);
                return (
                  <div key={f.id} className={cx("rounded-lg border bg-panel text-sm", retracted ? "border-line opacity-60" : issues.length ? "border-warn/40" : "border-line")}>
                    <button onClick={() => focusFinding(f)} className="block w-full px-3 py-2 text-left hover:text-accent">
                      <span className={cx("mr-2 font-mono text-xs font-semibold", retracted ? "text-faint" : "text-ok")}>{f.id}</span>
                      <span className={retracted ? "line-through" : ""}>{f.claim}</span>
                      <span className="mt-1 block text-xs text-faint">
                        证据：{f.evidence_id.split(",").join("、")}
                        {retracted ? ` · 审核后已被 ${f.replaced_by} 替换` : ""}
                      </span>
                    </button>
                    {issues.length > 0 && (
                      <div className="space-y-1.5 border-t border-line px-3 py-2">
                        {issues.map((i, k) => (
                          <IssueRow key={k} issue={i} compact />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="还没有登记结论。" />
          )
        ) : figures.length ? (
          <div className="space-y-4">
            {figures.map((f) => (
              <div key={f.cellId + f.title} className="rounded-lg border border-line p-2">
                <Plot fig={f.fig} height={300} />
                <button onClick={() => onFocus(`cell-${f.cellId}`)} className="mt-1 text-xs text-faint hover:text-accent">
                  来源：{f.cellId}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="还没有图表。" />
        )}
      </div>

      {view?.report && (
        <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2.5 text-xs">
          {view.check?.ok ? (
            <span className="flex items-center gap-1.5 text-ok">
              <ShieldCheck size={15} className="shrink-0" /> 数字核查通过 · {view.check.checked} 个数字均可溯源
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-warn">
              <ShieldAlert size={15} /> {view.check?.unsupported.length ?? 0} 个数字没有来源（已标红）
            </span>
          )}
          {view.reviewMode !== "off" && (
            <button
              onClick={() => setTab("findings")}
              className={cx("flex shrink-0 items-center gap-1 whitespace-nowrap hover:underline", view.issues.some((i) => i.severity === "error") ? "text-bad" : view.issues.length ? "text-warn" : "text-ok")}
              title="查看审核意见"
            >
              <ScanSearch size={14} />
              {view.issues.length ? `审核意见 ${view.issues.length}` : "审核通过"}
            </button>
          )}
          <button
            onClick={onVerify}
            disabled={verified}
            title="确认这次分析正确，代码会存入经验库，以后遇到相似问题时参考"
            className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-accent disabled:border-ok/40 disabled:text-ok"
          >
            {verified ? <BadgeCheck size={14} /> : <ThumbsUp size={14} />}
            {verified ? "已存入经验库" : "分析正确，存入经验库"}
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({ text, spinning }: { text: string; spinning?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-faint">
      {spinning && <Loader2 size={18} className="animate-spin text-accent" />}
      {text}
    </div>
  );
}
