import { useMemo } from "react";
import { Download, FileText, PanelLeft, PanelRight } from "lucide-react";
import { api } from "../lib/api";
import { DataView } from "../features/data/DataView";
import { EvalsView } from "../features/evals/EvalsView";
import { ExperienceView } from "../features/experience/ExperienceView";
import { HistoryView } from "../features/history/HistoryView";
import { KnowledgeView } from "../features/knowledge/KnowledgeView";
import { SettingsView } from "../features/settings/SettingsView";
import { Workspace } from "../features/analysis/Workspace";
import { IconButton, ToastProvider } from "../ui/kit";
import { Shell, type PaletteAction } from "./Shell";
import { StoreProvider, useStore } from "./store";

function Views() {
  const { view, session, runs, activeRun, events, prefs, setPref } = useStore();
  const finished = !!activeRun && (events[activeRun] ?? []).some((e) => e.type === "run.finished");

  const actions =
    view === "analysis" ? (
      <>
        {finished && (
          <a href={api.logUrl(activeRun!)} title="导出这次运行的完整日志（Markdown）" className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted hover:bg-sunken hover:text-ink sm:inline-flex">
            <FileText size={14} /> 日志
          </a>
        )}
        {session && runs.length > 0 && (
          <a href={api.notebookUrl(session.id)} title="导出为 Jupyter Notebook，可复现全部计算" className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted hover:bg-sunken hover:text-ink sm:inline-flex">
            <Download size={14} /> Notebook
          </a>
        )}
        <IconButton label={prefs.dockCollapsed ? "显示数据栏" : "隐藏数据栏"} active={!prefs.dockCollapsed} onClick={() => setPref("dockCollapsed", !prefs.dockCollapsed)} className="max-md:hidden">
          <PanelLeft size={16} />
        </IconButton>
        <IconButton label={prefs.reportCollapsed ? "显示报告栏" : "隐藏报告栏"} active={!prefs.reportCollapsed} onClick={() => setPref("reportCollapsed", !prefs.reportCollapsed)} className="max-md:hidden">
          <PanelRight size={16} />
        </IconButton>
      </>
    ) : null;

  const paletteActions = useMemo<PaletteAction[]>(() => {
    const xs: PaletteAction[] = [
      { id: "toggle-dock", label: prefs.dockCollapsed ? "显示数据栏" : "隐藏数据栏", group: "布局", run: () => setPref("dockCollapsed", !prefs.dockCollapsed) },
      { id: "toggle-report", label: prefs.reportCollapsed ? "显示报告栏" : "隐藏报告栏", group: "布局", run: () => setPref("reportCollapsed", !prefs.reportCollapsed) },
      { id: "confirm-plan", label: prefs.confirmPlan ? "关闭：执行前确认计划" : "开启：执行前确认计划", group: "分析", run: () => setPref("confirmPlan", !prefs.confirmPlan) },
      { id: "mode-single", label: "默认模式：单 Agent", group: "分析", run: () => setPref("defaultMode", "single") },
      { id: "mode-multi", label: "默认模式：多 Agent", group: "分析", run: () => setPref("defaultMode", "multi") },
    ];
    if (session && runs.length) xs.push({ id: "nb", label: "导出 Notebook", group: "导出", run: () => window.open(api.notebookUrl(session.id)) });
    if (activeRun) xs.push({ id: "log", label: "导出当前运行日志", group: "导出", run: () => window.open(api.logUrl(activeRun)) });
    return xs;
  }, [prefs.dockCollapsed, prefs.reportCollapsed, prefs.confirmPlan, session, runs.length, activeRun, setPref]);

  return (
    <Shell actions={actions} paletteActions={paletteActions}>
      {view === "analysis" && <Workspace />}
      {view === "data" && <DataView />}
      {view === "knowledge" && <KnowledgeView />}
      {view === "experience" && <ExperienceView />}
      {view === "history" && <HistoryView />}
      {view === "evals" && <EvalsView />}
      {view === "settings" && <SettingsView />}
    </Shell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <Views />
      </StoreProvider>
    </ToastProvider>
  );
}
