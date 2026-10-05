import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BadgeCheck, BarChart3, FileText, Loader2, ShieldAlert, ShieldCheck, Stamp, ThumbsUp } from "lucide-react";
import { figuresOf, type RunView } from "../derive";
import type { Finding } from "../types";
import { Plot } from "./Plot";

type Tab = "report" | "findings" | "charts";

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

function FindingChip({ finding, onClick }: { finding?: Finding; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={finding ? `${finding.claim}\n证据：${finding.evidence_id}` : "未知结论"}
      className={`mx-0.5 inline-flex items-center rounded px-1 align-baseline font-mono text-[0.7rem] font-semibold leading-tight ${finding ? "bg-ok-soft text-ok hover:ring-1 hover:ring-ok" : "bg-bad-soft text-bad"}`}
    >
      {finding?.id ?? "?"}
    </button>
  );
}

export function ReportPanel({
  view,
  onFocus,
  onVerify,
  verified,
}: {
  view: RunView | null;
  onFocus: (domId: string) => void;
  onVerify: () => void;
  verified: boolean;
}) {
  const [tab, setTab] = useState<Tab>("report");
  const figures = useMemo(() => (view ? figuresOf(view) : []), [view]);
  const findingsById = useMemo(() => Object.fromEntries((view?.findings ?? []).map((f) => [f.id, f])), [view]);
  const md = useMemo(() => (view?.report ? prepare(view.report, view) : ""), [view]);

  const focusFinding = (f?: Finding) => {
    if (!f) return;
    onFocus(f.evidence_type === "cell" ? `cell-${f.evidence_id}` : `chunk-${f.evidence_id}`);
  };

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "report", label: "报告", icon: FileText },
    { id: "findings", label: "结论", icon: Stamp, count: view?.findings.length },
    { id: "charts", label: "图表", icon: BarChart3, count: figures.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-line px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            <t.icon size={15} />
            {t.label}
            {!!t.count && <span className="rounded-full bg-sunken px-1.5 text-xs tabular-nums text-muted">{t.count}</span>}
          </button>
        ))}
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
                      return <FindingChip finding={f} onClick={() => focusFinding(f)} />;
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
        ) : tab === "findings" ? (
          view.findings.length ? (
            <div className="space-y-2">
              {view.findings.map((f) => (
                <button key={f.id} onClick={() => focusFinding(f)} className="block w-full rounded-lg border border-line bg-panel px-3 py-2 text-left text-sm hover:border-accent">
                  <span className="mr-2 font-mono text-xs font-semibold text-ok">{f.id}</span>
                  {f.claim}
                  <span className="mt-1 block text-xs text-faint">
                    证据：{f.evidence_type === "cell" ? "代码单元" : "文档片段"} {f.evidence_id}
                  </span>
                </button>
              ))}
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
              <ShieldCheck size={15} /> 数字核查通过 · {view.check.checked} 个数字均可溯源
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-warn">
              <ShieldAlert size={15} /> {view.check?.unsupported.length ?? 0} 个数字没有来源（已标红）
            </span>
          )}
          <button
            onClick={onVerify}
            disabled={verified}
            title="确认这次分析正确，代码会存入经验库，以后遇到相似问题时参考"
            className="ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-accent disabled:border-ok/40 disabled:text-ok"
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
