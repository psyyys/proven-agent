import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Cpu, Download, FileText, X } from "lucide-react";
import { api, streamEvents } from "./api";
import { deriveRun } from "./derive";
import { ReportPanel } from "./components/ReportPanel";
import { Sidebar } from "./components/Sidebar";
import { TableModal } from "./components/TableModal";
import { Timeline } from "./components/Timeline";
import type { AgentEvent, Health, Pack, Plan, RunMeta, SessionInfo, TableProfile } from "./types";

const PACK_KEY = "proven.pack";

function readPack(): string {
  try {
    return localStorage.getItem(PACK_KEY) || "business";
  } catch {
    return "business";
  }
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState(readPack);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState<TableProfile | null>(null);
  const subs = useRef<Map<string, () => void>>(new Map());

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    api.health().then(setHealth).catch(fail);
    api.packs().then(setPacks).catch(fail);
  }, []);

  // A pack switch starts a fresh session (new kernel, new semantic layer and knowledge base).
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setRuns([]);
    setActiveRun(null);
    subs.current.forEach((close) => close());
    subs.current.clear();
    try {
      localStorage.setItem(PACK_KEY, packId);
    } catch {
      /* storage unavailable */
    }
    let created: string | null = null;
    api
      .createSession(packId)
      .then((s) => {
        created = s.id;
        if (cancelled) fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
        else setSession(s);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (created) fetch(`/api/sessions/${created}`, { method: "DELETE" });
    };
  }, [packId]);

  const subscribe = useCallback((runId: string) => {
    if (subs.current.has(runId)) return;
    const close = streamEvents(runId, (e) => setEvents((prev) => ({ ...prev, [runId]: [...(prev[runId] ?? []), e] })));
    subs.current.set(runId, close);
  }, []);

  const view = useMemo(() => (activeRun && events[activeRun] ? deriveRun(events[activeRun]) : null), [activeRun, events]);
  const pack = packs.find((p) => p.id === packId);
  const running = !!view && !["done", "error", "cancelled", "needs_input"].includes(view.status);

  const ask = async (question: string, confirmPlan: boolean) => {
    if (!session) return;
    try {
      const run = await api.startRun(session.id, question, !confirmPlan);
      setRuns((r) => [...r, { id: run.id, question }]);
      setActiveRun(run.id);
      setFocus(null);
      subscribe(run.id);
    } catch (e) {
      fail(e);
    }
  };

  const withBusy = async (key: string, fn: () => Promise<SessionInfo>) => {
    setBusy(key);
    try {
      setSession(await fn());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col md:h-full">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <svg viewBox="0 0 32 32" className="h-6 w-6">
            <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
            <path d="M9 16.5l4.5 4.5L23 11" stroke="var(--color-panel)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Proven
        </div>
        <span className="hidden text-xs text-faint sm:inline">每个数字都有证据的数据分析 Agent</span>
        <select value={packId} onChange={(e) => setPackId(e.target.value)} className="ml-2 min-w-0 rounded-md sm:ml-4 border border-line bg-panel px-2 py-1 text-sm outline-none focus:border-accent" title="领域包">
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {view && (
            <span className="hidden tabular-nums text-faint md:inline">
              {view.usage.llm_calls} 次调用 · {(view.usage.input_tokens + view.usage.output_tokens).toLocaleString()} tokens
            </span>
          )}
          {health && (
            <span title={health.model} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${health.llm_configured ? "bg-sunken text-muted" : "bg-warn-soft text-warn"}`}>
              <Cpu size={13} className="shrink-0" />
              <span className="hidden max-w-48 truncate sm:inline">{health.llm_configured ? health.model : "未配置模型"}</span>
            </span>
          )}
          {activeRun && view && ["done", "error", "cancelled", "needs_input"].includes(view.status) && (
            <a href={api.logUrl(activeRun)} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-accent" title="导出这次运行的完整日志（Markdown），方便排查问题">
              <FileText size={13} /> 导出日志
            </a>
          )}
          {session && session.runs.length + runs.length > 0 && (
            <a href={api.notebookUrl(session.id)} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-accent" title="导出为 Jupyter Notebook，可复现全部计算">
              <Download size={13} /> 导出 Notebook
            </a>
          )}
        </div>
      </header>

      {health && !health.llm_configured && (
        <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-2 text-sm text-warn">
          <CircleAlert size={15} />
          没有配置模型 API Key。复制 <code className="font-mono">.env.example</code> 为 <code className="font-mono">.env</code>，填入百炼或 DeepSeek 的 Key 后重启服务。
        </div>
      )}

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <aside className="w-full shrink-0 border-b border-line bg-panel md:h-auto md:w-80 md:border-b-0 md:border-r">
          <Sidebar
            pack={pack}
            session={session}
            runs={runs}
            activeRun={activeRun}
            busy={busy}
            canStop={running}
            onSelectRun={(id) => {
              setActiveRun(id);
              setFocus(null);
              subscribe(id);
            }}
            onLoadDataset={(ds) => session && withBusy(ds, async () => (await api.loadDataset(session.id, ds)).session)}
            onUpload={(files) =>
              session &&
              withBusy("upload", async () => {
                const r = await api.upload(session.id, files);
                const bad = r.files.filter((f) => f.kind === "error");
                if (bad.length) setError(bad.map((b) => `${b.name}：${b.error}`).join("\n"));
                return r.session;
              })
            }
            onShowTable={(name) => session && api.table(session.id, name).then(setTable).catch(fail)}
            onAsk={ask}
            onStop={() => activeRun && api.cancel(activeRun).catch(fail)}
          />
        </aside>

        <main className="min-h-[60vh] min-w-0 flex-1 md:min-h-0">
          {view ? (
            <Timeline
              view={view}
              focus={focus}
              onApprove={(plan: Plan) => activeRun && api.approve(activeRun, plan).catch(fail)}
              onCancel={() => activeRun && api.cancel(activeRun).catch(fail)}
            />
          ) : (
            <Welcome pack={pack} hasData={!!session?.tables.length} />
          )}
        </main>

        <section className="min-h-[60vh] w-full shrink-0 border-t border-line bg-panel md:min-h-0 md:w-[30rem] md:border-l md:border-t-0">
          <ReportPanel
            view={view}
            onFocus={(id) => setFocus({ id, nonce: Date.now() })}
            verified={!!activeRun && verified.has(activeRun)}
            onVerify={() =>
              activeRun &&
              api
                .verify(activeRun)
                .then(() => setVerified((s) => new Set(s).add(activeRun)))
                .catch(fail)
            }
          />
        </section>
      </div>

      {table && <TableModal profile={table} onClose={() => setTable(null)} />}
      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-start gap-2 rounded-lg bg-bad px-4 py-3 text-sm text-white shadow-lg">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 shrink-0 opacity-80 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Welcome({ pack, hasData }: { pack: Pack | undefined; hasData: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <div className="text-2xl font-semibold tracking-tight">{pack?.name ?? "Proven"}</div>
        <p className="text-sm leading-relaxed text-muted">{pack?.description}</p>
        <ol className="space-y-2 text-left text-sm text-muted">
          <li className={hasData ? "text-ok" : ""}>1. 在左侧加载示例数据，或上传你自己的表格和文档</li>
          <li>2. 用自然语言提问，先看 Agent 的分析计划，可以直接修改</li>
          <li>3. 中间实时显示每一步代码和结果，右侧报告中的每个数字都能点开查看来源</li>
        </ol>
      </div>
    </div>
  );
}
