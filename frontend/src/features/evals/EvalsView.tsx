import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, Gauge, ListChecks, RefreshCw, Sprout } from "lucide-react";
import { api } from "../../lib/api";
import type { EvalListItem, EvalReport } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Bar, Card, cx, Empty, Kbd, Spinner, Tabs } from "../../ui/kit";
import { EvolvePanel } from "./EvolvePanel";

function parseRatio(v: string) {
  const [a, b] = v.split("/").map(Number);
  return { passed: a || 0, total: b || 0 };
}

function Compare({ a, b }: { a: EvalListItem; b: EvalListItem }) {
  const rows: { label: string; get: (x: EvalListItem) => number; fmt: (n: number) => string; better: "high" | "low" }[] = [
    { label: "正确率", get: (x) => x.summary.accuracy_pct, fmt: (n) => `${n}%`, better: "high" },
    { label: "平均模型调用", get: (x) => x.summary.avg_llm_calls, fmt: (n) => `${n} 次`, better: "low" },
    { label: "总 Token", get: (x) => x.summary.total_tokens, fmt: (n) => n.toLocaleString(), better: "low" },
    { label: "平均耗时", get: (x) => x.summary.avg_seconds, fmt: (n) => `${n} 秒`, better: "low" },
  ];
  const types = [...new Set([...Object.keys(a.summary.by_type), ...Object.keys(b.summary.by_type)])];
  const head = (x: EvalListItem) => (
    <th className="px-3 py-2 text-left font-medium">
      <div>
        {x.mode === "multi" ? "多 Agent" : "单 Agent"}
        {x.review && x.review !== "off" ? ` · 审核${x.review === "full" ? "（规则 + 模型）" : "（规则）"}` : ""}
      </div>
      <div className="text-xs font-normal text-faint">
        {x.model} · {x.time}
      </div>
    </th>
  );
  return (
    <Card title="对比">
      <table className="w-full text-sm">
        <thead className="text-faint">
          <tr className="border-b border-line">
            <th className="px-3 py-2 text-left font-medium">指标</th>
            {head(a)}
            {head(b)}
            <th className="px-3 py-2 text-left font-medium">变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const va = r.get(a);
            const vb = r.get(b);
            const diff = va ? ((vb - va) / va) * 100 : 0;
            const good = r.better === "high" ? diff > 0 : diff < 0;
            return (
              <tr key={r.label} className="border-b border-line">
                <td className="px-3 py-2 text-muted">{r.label}</td>
                <td className="px-3 py-2 tabular-nums">{r.fmt(va)}</td>
                <td className="px-3 py-2 tabular-nums">{r.fmt(vb)}</td>
                <td className={cx("px-3 py-2 tabular-nums", diff === 0 ? "text-faint" : good ? "text-ok" : "text-bad")}>
                  {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
          {types.map((t) => (
            <tr key={t} className="border-b border-line last:border-0">
              <td className="px-3 py-2 text-muted">题型 · {t}</td>
              <td className="px-3 py-2 tabular-nums">{a.summary.by_type[t] ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{b.summary.by_type[t] ?? "—"}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function EvalsView() {
  const [tab, setTab] = useState<"qa" | "evolve">("qa");
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line bg-panel px-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "qa", label: "问答评测", icon: <ListChecks size={15} /> },
            { id: "evolve", label: "经验进化", icon: <Sprout size={15} /> },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">{tab === "qa" ? <QaEvals /> : <EvolvePanel />}</div>
    </div>
  );
}

function QaEvals() {
  const { fail } = useStore();
  const [items, setItems] = useState<EvalListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  const load = useCallback(() => {
    setItems(null);
    api
      .evals()
      .then((xs) => {
        setItems(xs);
        if (xs.length) setSelected((s) => s ?? xs[0].name);
      })
      .catch(fail);
  }, [fail]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!selected) return;
    setReport(null);
    api.evalReport(selected).then(setReport).catch(fail);
  }, [selected, fail]);

  const toggleCompare = (name: string) => setCompare((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c.slice(-1), name]));

  if (!items) return <Empty icon={<Spinner />} title="读取评测报告" />;
  if (!items.length)
    return (
      <Empty icon={<Gauge size={28} />} title="还没有评测报告">
        <div className="space-y-1.5">
          <div>在终端运行，结果会出现在这里：</div>
          <div>
            <Kbd>proven eval --pack water --mode single</Kbd>
          </div>
          <div>
            <Kbd>proven eval --pack water --mode multi</Kbd>
          </div>
        </div>
      </Empty>
    );

  // Baseline first: single before multi, then older before newer, so "变化" reads as "what the change did".
  const cmp = (compare.map((n) => items.find((x) => x.name === n)).filter(Boolean) as EvalListItem[]).sort(
    (a, b) => (a.mode === b.mode ? a.name.localeCompare(b.name) : a.mode === "single" ? -1 : 1),
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="shrink-0 overflow-y-auto border-line bg-panel p-3 scroll-thin max-md:max-h-56 max-md:border-b md:w-72 md:border-r">
        <div className="mb-2 flex items-center px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">评测报告 · {items.length}</span>
          <button onClick={load} className="ml-auto text-faint hover:text-ink" title="刷新">
            <RefreshCw size={13} />
          </button>
        </div>
        <p className="mb-2 px-1 text-[0.7rem] text-faint">勾选两份报告进行对比</p>
        {items.map((x) => (
          <div key={x.name} className={cx("mb-1 flex items-start gap-2 rounded-lg px-2 py-2", selected === x.name ? "bg-accent-soft" : "hover:bg-sunken")}>
            <input type="checkbox" checked={compare.includes(x.name)} onChange={() => toggleCompare(x.name)} className="mt-1 accent-[var(--color-accent)]" />
            <button onClick={() => setSelected(x.name)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium">{x.pack}</span>
                <Badge tone={x.mode === "multi" ? "accent" : "neutral"}>{x.mode === "multi" ? "多 Agent" : "单 Agent"}</Badge>
                {x.review && x.review !== "off" && <Badge tone="ok">审核{x.review === "full" ? "+模型" : ""}</Badge>}
                <span className="ml-auto font-semibold tabular-nums">{x.summary.accuracy_pct}%</span>
              </div>
              <div className="truncate text-[0.7rem] text-faint">
                {x.model} · {x.time}
              </div>
            </button>
          </div>
        ))}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 scroll-thin sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {cmp.length === 2 && <Compare a={cmp[0]} b={cmp[1]} />}
          {!report ? (
            <Spinner label="读取报告…" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["正确率", `${report.summary.accuracy_pct}%`, `${report.summary.passed}/${report.summary.total} 题`],
                  ["平均模型调用", `${report.summary.avg_llm_calls}`, "次 / 题"],
                  ["总 Token", report.summary.total_tokens.toLocaleString(), `${report.model}`],
                  ["平均耗时", `${report.summary.avg_seconds} 秒`, report.mode === "multi" ? "多 Agent" : "单 Agent"],
                ].map(([label, value, sub]) => (
                  <div key={label} className="rounded-xl border border-line bg-panel px-4 py-3">
                    <div className="text-xs text-faint">{label}</div>
                    <div className="text-xl font-semibold tabular-nums">{value}</div>
                    <div className="truncate text-xs text-muted">{sub}</div>
                  </div>
                ))}
              </div>
              <Card title="按题型">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(report.summary.by_type).map(([t, v]) => {
                    const { passed, total } = parseRatio(v);
                    return (
                      <div key={t}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span>{t}</span>
                          <span className="tabular-nums text-muted">{v}</span>
                        </div>
                        <Bar value={passed} max={total} tone={passed === total ? "ok" : passed === 0 ? "bad" : "warn"} />
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card title="逐题结果" bodyClassName="p-0">
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-faint">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 font-medium">编号</th>
                        <th className="px-2 py-2 font-medium">问题</th>
                        <th className="px-2 py-2 font-medium">标准答案</th>
                        <th className="px-2 py-2 font-medium">用量</th>
                        <th className="px-4 py-2 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.results.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="whitespace-nowrap px-4 py-2">
                            <span className="flex items-center gap-1.5">
                              {r.passed ? <CircleCheck size={15} className="text-ok" /> : <CircleX size={15} className="text-bad" />}
                              <span className="font-mono text-xs">{r.id}</span>
                            </span>
                            <span className="text-[0.7rem] text-faint">{r.type}</span>
                          </td>
                          <td className="max-w-sm px-2 py-2">{r.question}</td>
                          <td className="px-2 py-2 font-mono text-xs text-muted">{JSON.stringify(r.expected)}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted">
                            {(r.input_tokens + r.output_tokens).toLocaleString()} · {r.llm_calls} 次 · {r.seconds}s
                          </td>
                          <td className="px-4 py-2 text-xs text-muted">{r.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-faint">
                再跑一次：<Kbd>proven eval --pack {report.pack} --mode {report.mode === "multi" ? "single" : "multi"}</Kbd> 生成另一种模式的报告，勾选两份即可对比。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
