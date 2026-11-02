import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Play, RefreshCw, ScrollText, Search } from "lucide-react";
import { api } from "../../lib/api";
import type { HistoryRun } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Button, Card, cx, Empty, Input, Segmented, Spinner } from "../../ui/kit";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" | "accent" }> = {
  done: { label: "完成", tone: "ok" },
  error: { label: "出错", tone: "bad" },
  cancelled: { label: "已取消", tone: "neutral" },
  needs_input: { label: "等待回答", tone: "warn" },
  running: { label: "进行中", tone: "accent" },
};

/** Every run recorded in the trace, including ones from earlier server sessions. Open to replay. */
export function HistoryView() {
  const { openRun, packs, fail } = useStore();
  const [items, setItems] = useState<HistoryRun[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    setItems(null);
    api.history(200).then(setItems).catch(fail);
  }, [fail]);
  useEffect(load, [load]);

  const packName = useMemo(() => Object.fromEntries(packs.map((p) => [p.id, p.name])), [packs]);
  const shown = (items ?? []).filter(
    (r) => (status === "all" || r.status === status) && (r.question + r.model + r.pack).toLowerCase().includes(q.trim().toLowerCase()),
  );
  const maxTokens = Math.max(1, ...(items ?? []).map((r) => r.tokens));

  return (
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">运行记录</h2>
            <p className="text-xs text-muted">所有运行都保存在 workspace/trace.db 中，包括以前启动服务时的运行。打开后可以完整回放每一步。</p>
          </div>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={load} className="ml-auto">
            刷新
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索问题、模型、领域包" className="pl-8" />
          </div>
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "全部" },
              { value: "done", label: "完成" },
              { value: "error", label: "出错" },
              { value: "running", label: "进行中" },
            ]}
          />
          {items && <span className="text-xs text-faint">{shown.length} 条</span>}
        </div>

        {!items ? (
          <Spinner label="读取记录…" />
        ) : shown.length === 0 ? (
          <Card>
            <Empty icon={<ScrollText size={26} />} title="没有运行记录" />
          </Card>
        ) : (
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-faint">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">时间</th>
                    <th className="px-2 py-2 font-medium">问题</th>
                    <th className="px-2 py-2 font-medium">领域包 / 模型</th>
                    <th className="px-2 py-2 font-medium">状态</th>
                    <th className="w-40 px-2 py-2 font-medium">Token</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                    return (
                      <tr key={r.run_id} className="border-b border-line last:border-0 hover:bg-sunken/60">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted">{r.time}</td>
                        <td className="max-w-md px-2 py-2.5">
                          <div className="truncate" title={r.question}>
                            {r.question}
                          </div>
                          <div className="font-mono text-[0.7rem] text-faint">{r.run_id}</div>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-muted">
                          <div>{packName[r.pack] ?? r.pack}</div>
                          <div className="truncate text-faint">{r.model}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="mb-1 text-xs tabular-nums text-muted">
                            {r.tokens.toLocaleString()} · {r.llm_calls} 次
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-sunken">
                            <div className={cx("h-full rounded-full", r.status === "error" ? "bg-bad" : "bg-accent")} style={{ width: `${Math.max(2, (r.tokens / maxTokens) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Button size="sm" variant="ghost" icon={<Play size={13} />} onClick={() => openRun(r.run_id, r.question)}>
                            回放
                          </Button>
                          <a href={api.logUrl(r.run_id)} className="ml-1 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-sunken hover:text-ink">
                            <FileText size={13} /> 日志
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
