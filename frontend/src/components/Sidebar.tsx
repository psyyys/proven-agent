import { useRef, useState } from "react";
import { ArrowUp, BookOpen, Database, FileUp, Loader2, MessageSquare, Square, Table2 } from "lucide-react";
import type { Pack, RunMeta, SessionInfo } from "../types";

export function Sidebar({
  pack,
  session,
  runs,
  activeRun,
  busy,
  canStop,
  onSelectRun,
  onLoadDataset,
  onUpload,
  onShowTable,
  onAsk,
  onStop,
  defaultMode,
}: {
  pack: Pack | undefined;
  session: SessionInfo | null;
  runs: RunMeta[];
  activeRun: string | null;
  busy: string | null;
  canStop: boolean;
  onSelectRun: (id: string) => void;
  onLoadDataset: (id: string) => void;
  onUpload: (files: File[]) => void;
  onShowTable: (name: string) => void;
  onAsk: (q: string, confirmPlan: boolean, mode: "single" | "multi") => void;
  defaultMode: "single" | "multi";
  onStop: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [confirmPlan, setConfirmPlan] = useState(true);
  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const effectiveMode = mode ?? defaultMode;
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedDatasets = new Set(session?.tables.map((t) => t.dataset).filter(Boolean));
  const loadedFiles = new Set(session?.tables.map((t) => t.file));

  const submit = () => {
    const q = question.trim();
    if (!q || canStop) return;
    onAsk(q, confirmPlan, effectiveMode);
    setQuestion("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scroll-thin">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
            <Database size={13} /> 数据
          </h3>
          {session && session.tables.length > 0 ? (
            <div className="space-y-0.5">
              {session.tables.map((t) => (
                <button key={t.name} onClick={() => onShowTable(t.name)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken">
                  <Table2 size={14} className="shrink-0 text-accent" />
                  <span className="truncate font-mono text-[0.82rem]">{t.name}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">
                    {t.rows.toLocaleString()} × {t.columns}
                  </span>
                </button>
              ))}
            </div>
          ) : session ? (
            <p className="px-2 text-xs text-faint">还没有数据。加载示例数据，或上传 CSV / Excel。</p>
          ) : (
            <p className="flex items-center gap-1.5 px-2 text-xs text-faint">
              <Loader2 size={12} className="animate-spin" /> 正在启动分析内核…
            </p>
          )}

          {pack && pack.datasets.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {pack.datasets.map((d) => {
                const loaded = loadedDatasets.has(d.id) || d.files.every((f) => loadedFiles.has(f.split("/").pop()!));
                return (
                  <button
                    key={d.id}
                    disabled={loaded || !!busy || !session}
                    onClick={() => onLoadDataset(d.id)}
                    title={`${d.description}\n来源：${d.source}\n许可：${d.license}`}
                    className="flex w-full items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-default disabled:border-solid disabled:opacity-60 disabled:hover:border-line disabled:hover:text-muted"
                  >
                    {busy === d.id ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <Database size={13} className="shrink-0" />}
                    <span className="truncate">{loaded ? "已加载：" : "加载示例："}{d.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => fileInput.current?.click()}
            disabled={!!busy || !session}
            className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {busy === "upload" ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <FileUp size={13} className="shrink-0" />}
            <span>上传数据或文档（CSV、Excel、PDF、Word、Markdown）</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept=".csv,.tsv,.txt,.xlsx,.xls,.parquet,.json,.pdf,.md,.markdown,.docx"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onUpload(files);
              e.target.value = "";
            }}
          />
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
            <BookOpen size={13} /> 知识库
          </h3>
          {session && session.documents.length > 0 ? (
            <div className="space-y-1 px-2">
              {session.documents.map((d) => (
                <div key={d.name} className="truncate text-xs text-muted" title={d.name}>
                  {d.name}
                </div>
              ))}
              <div className="pt-1 text-xs text-faint">
                {session.knowledge_chunks} 个片段 · {session.vector_search ? "向量 + 关键词混合检索" : "关键词检索（未配置向量模型）"}
              </div>
            </div>
          ) : (
            <p className="px-2 text-xs text-faint">没有文档。</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
            <MessageSquare size={13} /> 提问记录
          </h3>
          {runs.length ? (
            <div className="space-y-0.5">
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectRun(r.id)}
                  className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${r.id === activeRun ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken"}`}
                >
                  {r.question}
                </button>
              ))}
            </div>
          ) : (
            pack &&
            pack.examples.length > 0 && (
              <div className="space-y-1">
                <p className="px-2 pb-1 text-xs text-faint">试试这些问题：</p>
                {pack.examples.map((ex) => (
                  <button key={ex} onClick={() => setQuestion(ex)} className="block w-full rounded-md px-2 py-1.5 text-left text-xs leading-relaxed text-muted hover:bg-sunken hover:text-ink">
                    {ex}
                  </button>
                ))}
              </div>
            )
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="rounded-xl border border-line bg-panel focus-within:border-accent">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder={session ? "问一个关于数据的问题…" : "正在准备会话…"}
            disabled={!session}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-faint"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={confirmPlan} onChange={(e) => setConfirmPlan(e.target.checked)} className="accent-[var(--color-accent)]" />
              执行前确认计划
            </label>
            <select
              value={effectiveMode}
              onChange={(e) => setMode(e.target.value as "single" | "multi")}
              title="单 Agent：一个循环完成全部步骤。多 Agent：每个计划步骤派一个上下文独立的分析员"
              className="rounded border border-line bg-panel px-1 py-0.5 text-xs text-muted outline-none focus:border-accent"
            >
              <option value="single">单 Agent</option>
              <option value="multi">多 Agent</option>
            </select>
            {canStop ? (
              <button onClick={onStop} title="停止" className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-panel">
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button onClick={submit} disabled={!question.trim() || !session} title="发送（Enter）" className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-30 dark:text-black">
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
