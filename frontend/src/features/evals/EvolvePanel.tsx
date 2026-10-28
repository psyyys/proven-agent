import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sprout } from "lucide-react";
import { api } from "../../lib/api";
import type { EvolveListItem, EvolveReport } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Bar, Card, cx, Empty, Kbd, Spinner } from "../../ui/kit";
import { FAILURE_LABEL } from "../analysis/Timeline";

/** Results of `proven evolve`: accuracy and failures on the test set before and after learning lessons. */
export function EvolvePanel() {
  const { fail } = useStore();
  const [items, setItems] = useState<EvolveListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<EvolveReport | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .evolveReports()
      .then((xs) => {
        setItems(xs);
        setSelected((s) => s ?? xs[0]?.name ?? null);
      })
      .catch(fail);
  }, [fail]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!selected) return;
    setReport(null);
    api.evolveReport(selected).then(setReport).catch(fail);
  }, [selected, fail]);

  if (!items) return <Empty icon={<Spinner />} title="读取经验进化报告" />;
  if (!items.length)
    return (
      <Empty icon={<Sprout size={28} />} title="还没有经验进化实验">
        <div className="space-y-1.5">
          <div>在训练题上总结教训，在测试题上比较学习前后的效果。在终端运行：</div>
          <div>
            <Kbd>proven evolve --pack water</Kbd>
          </div>
          <div className="text-xs text-faint">会多次调用模型（约为一次完整评测的 3 倍），结果出现在这里</div>
        </div>
      </Empty>
    );

  const kinds = report ? [...new Set([...report.rounds, ...report.training].flatMap((r) => Object.keys(r.failures)))] : [];
  const maxFail = Math.max(1, ...(report?.rounds.map((r) => r.failures_total) ?? [1]));

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="shrink-0 overflow-y-auto border-line bg-panel p-3 scroll-thin max-md:max-h-48 max-md:border-b md:w-72 md:border-r">
        <div className="mb-2 flex items-center px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">实验 · {items.length}</span>
          <button onClick={load} className="ml-auto text-faint hover:text-ink" title="刷新">
            <RefreshCw size={13} />
          </button>
        </div>
        {items.map((x) => {
          const first = x.rounds[0]?.accuracy_pct ?? 0;
          const last = x.rounds[x.rounds.length - 1]?.accuracy_pct ?? 0;
          return (
            <button key={x.name} onClick={() => setSelected(x.name)} className={cx("mb-1 block w-full rounded-lg px-2 py-2 text-left", selected === x.name ? "bg-accent-soft" : "hover:bg-sunken")}>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium">{x.pack}</span>
                <Badge>{x.mode === "multi" ? "多 Agent" : "单 Agent"}</Badge>
                <span className="ml-auto tabular-nums">
                  {first}% → <span className={last > first ? "text-ok" : last < first ? "text-bad" : ""}>{last}%</span>
                </span>
              </div>
              <div className="truncate text-[0.7rem] text-faint">
                {x.model} · {x.time}
              </div>
            </button>
          );
        })}
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 scroll-thin sm:p-6">
        {!report ? (
          <Spinner label="读取报告…" />
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <p className="text-xs text-muted">
              训练集 {report.train.join("、")}（学习教训），测试集 {report.test.join("、")}（只读教训，用来打分）。测试集从不参与学习。
              每轮只有十几道题，一两题的差异在随机波动范围内，要和失败次数一起看。
            </p>
            <Card title="测试集上的变化" bodyClassName="p-0">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-faint">
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 font-medium">轮次</th>
                      <th className="px-2 py-2 font-medium">正确率</th>
                      <th className="w-40 px-2 py-2 font-medium">失败次数</th>
                      {kinds.map((k) => (
                        <th key={k} className="px-2 py-2 font-medium">
                          {FAILURE_LABEL[k] ?? k}
                        </th>
                      ))}
                      <th className="px-2 py-2 font-medium">Token</th>
                      <th className="px-4 py-2 font-medium">可用教训 / 平均参考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rounds.map((r) => (
                      <tr key={r.label} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-4 py-2">{r.label}</td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                          <span className="font-semibold">{r.accuracy_pct}%</span> <span className="text-xs text-faint">{r.passed}/{r.total}</span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="mb-1 text-xs tabular-nums">{r.failures_total}</div>
                          <Bar value={r.failures_total} max={maxFail} tone="warn" />
                        </td>
                        {kinds.map((k) => (
                          <td key={k} className="px-2 py-2 tabular-nums text-muted">
                            {r.failures[k] ?? 0}
                          </td>
                        ))}
                        <td className="px-2 py-2 tabular-nums text-muted">{r.tokens.toLocaleString()}</td>
                        <td className="px-4 py-2 tabular-nums text-muted">
                          {r.lessons_active} / {r.lessons_used_avg}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title={`学到的教训 · ${report.lessons.length}`}>
              {report.lessons.length === 0 ? (
                <div className="text-sm text-faint">训练中没有总结出教训。</div>
              ) : (
                <div className="space-y-2">
                  {report.lessons.map((x) => (
                    <div key={x.id} className={cx("text-sm", x.status === "retired" && "opacity-60")}>
                      <span className="mr-1.5 font-mono font-semibold text-accent">{x.label}</span>
                      {x.when && <span className="text-faint">{x.when}：</span>}
                      <span className={x.status === "retired" ? "line-through" : ""}>{x.text}</span>
                      <span className="ml-2 text-xs text-faint">
                        {FAILURE_LABEL[x.category] ?? x.category} · 总结 {x.hits} 次 · 使用 {x.uses} 次（有效 {x.helped} / 无效 {x.failed_after}）
                        {x.status === "retired" ? " · 已停用" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <p className="text-xs text-faint">实验在独立的工作区运行（{report.lessons.length ? "教训不会进入日常使用的经验库" : "不影响日常使用的经验库"}）。</p>
          </div>
        )}
      </div>
    </div>
  );
}
