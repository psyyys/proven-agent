import { useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Database, FileUp, Loader2, MessageSquare, Table2 } from "lucide-react";
import { api } from "../../lib/api";
import { useStore } from "../../app/store";
import { cx } from "../../ui/kit";

function Section({ icon, title, count, children, defaultOpen = true }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button onClick={() => setOpen(!open)} className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint hover:text-muted">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        {title}
        {!!count && <span className="ml-auto rounded-full bg-sunken px-1.5 font-normal tabular-nums">{count}</span>}
      </button>
      {open && children}
    </section>
  );
}

export function DataDock({ onShowTable }: { onShowTable: (name: string) => void }) {
  const { pack, session, setSession, runs, activeRun, openRun, fail, notify, setView } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedDatasets = new Set(session?.tables.map((t) => t.dataset).filter(Boolean));
  const loadedFiles = new Set(session?.tables.map((t) => t.file));

  const upload = async (files: File[]) => {
    if (!session || !files.length) return;
    setBusy("upload");
    try {
      const r = await api.upload(session.id, files);
      setSession(r.session);
      const bad = r.files.filter((f) => f.kind === "error");
      if (bad.length) notify(bad.map((b) => `${b.name}：${b.error}`).join("\n"), "error");
      const ok = r.files.length - bad.length;
      if (ok) notify(`已添加 ${ok} 个文件`, "ok");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const loadDataset = async (id: string) => {
    if (!session) return;
    setBusy(id);
    try {
      setSession((await api.loadDataset(session.id, id)).session);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cx("h-full space-y-5 overflow-y-auto p-4 scroll-thin", dragging && "bg-accent-soft/40 outline-2 -outline-offset-4 outline-dashed outline-accent")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      <Section icon={<Database size={12} />} title="数据" count={session?.tables.length}>
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
            <button onClick={() => setView("data")} className="px-2 pt-1 text-xs text-accent hover:underline">
              在数据视图中浏览 →
            </button>
          </div>
        ) : session ? (
          <p className="px-2 text-xs text-faint">还没有数据。加载示例，或把文件拖到这里。</p>
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
                  onClick={() => loadDataset(d.id)}
                  title={`${d.description}\n来源：${d.source}\n许可：${d.license}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-default disabled:border-solid disabled:opacity-60 disabled:hover:border-line disabled:hover:text-muted"
                >
                  {busy === d.id ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <Database size={13} className="shrink-0" />}
                  <span className="truncate">
                    {loaded ? "已加载：" : "加载示例："}
                    {d.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => fileInput.current?.click()}
          disabled={!!busy || !session}
          className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {busy === "upload" ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <FileUp size={13} className="shrink-0" />}
          <span>上传或拖入文件（CSV、Excel、PDF、Word、Markdown）</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept=".csv,.tsv,.txt,.xlsx,.xls,.parquet,.json,.pdf,.md,.markdown,.docx"
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </Section>

      <Section icon={<BookOpen size={12} />} title="知识库" count={session?.documents.length}>
        {session && session.documents.length > 0 ? (
          <div className="space-y-1 px-2">
            {session.documents.map((d) => (
              <div key={d.name} className="truncate text-xs text-muted" title={d.name}>
                {d.name}
              </div>
            ))}
            <button onClick={() => setView("knowledge")} className="pt-1 text-xs text-accent hover:underline">
              {session.knowledge_chunks} 个片段 · 测试检索 →
            </button>
          </div>
        ) : (
          <p className="px-2 text-xs text-faint">没有文档。</p>
        )}
      </Section>

      <Section icon={<MessageSquare size={12} />} title="本次会话" count={runs.length}>
        {runs.length ? (
          <div className="space-y-0.5">
            {[...runs].reverse().map((r) => (
              <button
                key={r.id}
                onClick={() => openRun(r.id)}
                className={cx("block w-full truncate rounded-md px-2 py-1.5 text-left text-sm", r.id === activeRun ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken")}
              >
                {r.question}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 text-xs text-faint">还没有提问。历史运行见"运行记录"。</p>
        )}
      </Section>
    </div>
  );
}
