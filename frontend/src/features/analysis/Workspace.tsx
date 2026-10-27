import { useCallback, useMemo, useRef, useState } from "react";
import { BookOpen, Database, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { deriveRun } from "../../lib/derive";
import type { Plan, TableProfile } from "../../lib/types";
import { useStore } from "../../app/store";
import { TableModal } from "../data/TableModal";
import { Composer } from "./Composer";
import { DataDock } from "./DataDock";
import { ReportPanel } from "./ReportPanel";
import { Timeline } from "./Timeline";

/** Drag handle that resizes a side pane; `side` says which edge of the pane the handle sits on. */
function ResizeHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const [active, setActive] = useState(false);
  const last = useRef(0);
  return (
    <div
      className="resize-handle hidden md:block"
      data-active={active}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        last.current = e.clientX;
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!active) return;
        onDrag(e.clientX - last.current);
        last.current = e.clientX;
      }}
      onPointerUp={() => setActive(false)}
    />
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Welcome() {
  const { pack, session } = useStore();
  const cards = [
    { icon: Database, title: "加载数据", text: "左侧加载示例数据集，或把 CSV、Excel、文档拖进来", done: !!session?.tables.length },
    { icon: Sparkles, title: "提问并确认计划", text: "用自然语言提问；Agent 先给出计划，你可以修改后再执行" },
    { icon: FileSearch, title: "看每一步", text: "中间实时显示代码、输出、检索和登记的结论，可按类型筛选" },
    { icon: ShieldCheck, title: "核对报告", text: "报告中每个数字都能点开溯源，没有来源的数字会被标红" },
  ];
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-1 text-sm text-accent">{pack?.name}</div>
        <h1 className="text-2xl font-semibold tracking-tight">每个数字都有证据的数据分析</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{pack?.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div key={c.title} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.done ? "bg-ok-soft text-ok" : "bg-accent-soft text-accent"}`}>
                  <c.icon size={15} />
                </span>
                <span className="text-sm font-semibold">
                  {i + 1}. {c.title}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{c.text}</p>
            </div>
          ))}
        </div>
        {pack && pack.knowledge.length > 0 && (
          <p className="mt-5 flex items-center gap-1.5 text-xs text-faint">
            <BookOpen size={13} /> 已内置知识库：{pack.knowledge.join("、")}
          </p>
        )}
      </div>
    </div>
  );
}

export function Workspace() {
  const { session, activeRun, events, addRun, openRun, prefs, setPref, verified, markVerified, fail, notify } = useStore();
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [table, setTable] = useState<TableProfile | null>(null);

  const view = useMemo(() => (activeRun && events[activeRun] ? deriveRun(events[activeRun]) : null), [activeRun, events]);
  const running = !!view && !["done", "error", "cancelled", "needs_input"].includes(view.status);

  const ask = useCallback(
    async (question: string, confirmPlan: boolean, mode: "single" | "multi") => {
      if (!session) return;
      try {
        const run = await api.startRun(session.id, question, !confirmPlan, mode);
        addRun({ id: run.id, question });
        openRun(run.id);
        setFocus(null);
      } catch (e) {
        fail(e);
      }
    },
    [session, addRun, openRun, fail],
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {!prefs.dockCollapsed && (
        <>
          <aside className="shrink-0 border-line bg-panel max-md:max-h-72 max-md:border-b md:border-r" style={{ width: window.innerWidth >= 768 ? prefs.dockWidth : undefined }}>
            <DataDock onShowTable={(name) => session && api.table(session.id, name).then(setTable).catch(fail)} />
          </aside>
          <ResizeHandle onDrag={(dx) => setPref("dockWidth", clamp(prefs.dockWidth + dx, 220, 480))} />
        </>
      )}

      <main className="flex min-h-[70vh] min-w-0 flex-1 flex-col md:min-h-0">
        <div className="min-h-0 flex-1">
          {view ? (
            <Timeline
              view={view}
              focus={focus}
              showReasoning={prefs.showReasoning}
              autoScroll={prefs.autoScroll}
              codeOpenByDefault={prefs.codeOpenByDefault}
              onApprove={(plan: Plan) => activeRun && api.approve(activeRun, plan).catch(fail)}
              onCancel={() => activeRun && api.cancel(activeRun).catch(fail)}
            />
          ) : (
            <Welcome />
          )}
        </div>
        <Composer running={running} onAsk={ask} onStop={() => activeRun && api.cancel(activeRun).catch(fail)} />
      </main>

      {!prefs.reportCollapsed && (
        <>
          <ResizeHandle onDrag={(dx) => setPref("reportWidth", clamp(prefs.reportWidth - dx, 320, 820))} />
          <section className="min-h-[60vh] shrink-0 border-line bg-panel max-md:border-t md:min-h-0 md:border-l" style={{ width: window.innerWidth >= 768 ? prefs.reportWidth : undefined }}>
            <ReportPanel
              view={view}
              onFocus={(id) => setFocus({ id, nonce: Date.now() })}
              onNotify={(t) => notify(t, "ok")}
              verified={!!activeRun && verified.has(activeRun)}
              onVerify={() =>
                activeRun &&
                api
                  .verify(activeRun)
                  .then(() => {
                    markVerified(activeRun);
                    notify("已存入经验库", "ok");
                  })
                  .catch(fail)
              }
            />
          </section>
        </>
      )}

      {table && <TableModal profile={table} onClose={() => setTable(null)} />}
    </div>
  );
}
