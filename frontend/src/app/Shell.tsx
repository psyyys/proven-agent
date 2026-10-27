import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  CircleAlert,
  Command,
  Cpu,
  Gauge,
  Lightbulb,
  Monitor,
  Moon,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Sun,
  Table2,
} from "lucide-react";
import { cx, IconButton, Kbd } from "../ui/kit";
import { useStore, type ViewId } from "./store";

export const NAV: { id: ViewId; label: string; short: string; icon: typeof Sparkles; hint: string }[] = [
  { id: "analysis", label: "分析", short: "分析", icon: Sparkles, hint: "提问、查看执行过程和报告" },
  { id: "data", label: "数据", short: "数据", icon: Table2, hint: "浏览已加载的数据表" },
  { id: "knowledge", label: "知识库", short: "知识", icon: BookOpen, hint: "文档与检索测试" },
  { id: "experience", label: "经验库", short: "经验", icon: Lightbulb, hint: "已验证的分析经验" },
  { id: "history", label: "运行记录", short: "记录", icon: ScrollText, hint: "历史运行、回放与日志" },
  { id: "evals", label: "评测", short: "评测", icon: Gauge, hint: "评测报告与模式对比" },
  { id: "settings", label: "设置", short: "设置", icon: Settings, hint: "外观、默认选项与运行参数" },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path d="M9 16.5l4.5 4.5L23 11" stroke="var(--color-on-accent)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeButton() {
  const { prefs, setPref } = useStore();
  const order = ["system", "light", "dark"] as const;
  const next = order[(order.indexOf(prefs.theme) + 1) % order.length];
  const Icon = prefs.theme === "dark" ? Moon : prefs.theme === "light" ? Sun : Monitor;
  const label = { system: "跟随系统", light: "浅色", dark: "深色" }[prefs.theme];
  return (
    <IconButton label={`主题：${label}（点击切换）`} onClick={() => setPref("theme", next)}>
      <Icon size={17} />
    </IconButton>
  );
}

function NavRail() {
  const { view, setView, setPaletteOpen } = useStore();
  return (
    <nav className="flex shrink-0 border-line bg-panel md:w-16 md:flex-col md:items-center md:border-r md:py-3 max-md:order-last max-md:justify-around max-md:border-t max-md:px-1 max-md:py-1">
      <div className="mb-4 hidden md:block">
        <Logo />
      </div>
      <div className="flex md:flex-col md:gap-1 max-md:w-full max-md:justify-around">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            title={`${n.label} · ${n.hint}`}
            className={cx(
              "group flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 text-[0.65rem] transition-colors md:w-12",
              view === n.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            <n.icon size={19} />
            <span className="whitespace-nowrap">{n.short}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto hidden flex-col items-center gap-1 md:flex">
        <IconButton label="命令面板（Ctrl+K）" onClick={() => setPaletteOpen(true)}>
          <Command size={17} />
        </IconButton>
        <ThemeButton />
      </div>
    </nav>
  );
}

function PackSwitcher() {
  const { packs, pack, setPackId, session } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative min-w-0">
      <button onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1 text-sm hover:border-accent">
        <span className={cx("h-2 w-2 shrink-0 rounded-full", session ? "bg-ok" : "animate-pulse bg-warn")} title={session ? "会话已就绪" : "正在启动内核"} />
        <span className="truncate font-medium">{pack?.name ?? "加载中…"}</span>
        <ChevronDown size={14} className="shrink-0 text-faint" />
      </button>
      {open && (
        <div className="pop-in absolute left-0 top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-line bg-raised shadow-xl">
          <div className="border-b border-line px-3 py-2 text-xs text-faint">领域包 · 切换后会开启新会话</div>
          {packs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPackId(p.id);
                setOpen(false);
              }}
              className={cx("block w-full px-3 py-2.5 text-left hover:bg-sunken", p.id === pack?.id && "bg-accent-soft/60")}
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</div>
              <div className="mt-1 text-[0.7rem] text-faint">
                {p.datasets.length} 个示例数据集 · {p.knowledge.length} 份知识文档
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar({ actions }: { actions?: ReactNode }) {
  const { health, settings, newSession, setPaletteOpen, view } = useStore();
  const current = NAV.find((n) => n.id === view);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:px-4">
      <div className="md:hidden">
        <Logo />
      </div>
      <PackSwitcher />
      <IconButton label="新会话（清空当前数据和对话）" onClick={newSession}>
        <RotateCcw size={16} />
      </IconButton>
      <span className="hidden text-sm text-faint lg:inline">/ {current?.label}</span>
      <button
        onClick={() => setPaletteOpen(true)}
        className="ml-auto hidden items-center gap-2 rounded-lg border border-line bg-sunken px-2.5 py-1 text-xs text-faint hover:border-accent sm:flex"
      >
        <Search size={13} /> 搜索命令 <Kbd>Ctrl K</Kbd>
      </button>
      <div className="flex items-center gap-2 max-sm:ml-auto">
        {actions}
        {health && (
          <span
            title={`${health.model}${settings?.base_url_host ? " @ " + settings.base_url_host : ""}`}
            className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", health.llm_configured ? "bg-sunken text-muted" : "bg-warn-soft text-warn")}
          >
            <Cpu size={13} className="shrink-0" />
            <span className="hidden max-w-40 truncate md:inline">{health.llm_configured ? health.model : "未配置模型"}</span>
            {settings && <span className="hidden rounded bg-panel px-1 lg:inline">{settings.mode === "multi" ? "多 Agent" : "单 Agent"}</span>}
          </span>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- command palette

export interface PaletteAction {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

function CommandPalette({ extra }: { extra: PaletteAction[] }) {
  const { paletteOpen, setPaletteOpen, setView, packs, setPackId, setPref, newSession, prefs } = useStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const actions = useMemo<PaletteAction[]>(
    () => [
      ...NAV.map((n) => ({ id: `view-${n.id}`, label: `打开：${n.label}`, group: "导航", hint: n.hint, run: () => setView(n.id) })),
      ...packs.map((p) => ({ id: `pack-${p.id}`, label: `切换领域包：${p.name}`, group: "会话", run: () => setPackId(p.id) })),
      { id: "new-session", label: "新会话", group: "会话", hint: "清空数据和对话，重启内核", run: newSession },
      { id: "theme-light", label: "主题：浅色", group: "外观", run: () => setPref("theme", "light") },
      { id: "theme-dark", label: "主题：深色", group: "外观", run: () => setPref("theme", "dark") },
      { id: "theme-system", label: "主题：跟随系统", group: "外观", run: () => setPref("theme", "system") },
      {
        id: "density",
        label: prefs.density === "compact" ? "布局：舒适" : "布局：紧凑",
        group: "外观",
        run: () => setPref("density", prefs.density === "compact" ? "comfortable" : "compact"),
      },
      { id: "reasoning", label: prefs.showReasoning ? "隐藏模型思考过程" : "显示模型思考过程", group: "分析", run: () => setPref("showReasoning", !prefs.showReasoning) },
      ...extra,
    ],
    [packs, prefs.density, prefs.showReasoning, extra, setView, setPackId, setPref, newSession],
  );

  const shown = actions.filter((a) => (a.label + a.group + (a.hint ?? "")).toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [paletteOpen]);
  useEffect(() => setIdx(0), [q]);

  if (!paletteOpen) return null;
  const choose = (a?: PaletteAction) => {
    if (!a) return;
    setPaletteOpen(false);
    a.run();
  };
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onClick={() => setPaletteOpen(false)}>
      <div className="pop-in w-full max-w-xl overflow-hidden rounded-xl border border-line bg-raised shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setIdx((i) => Math.min(i + 1, shown.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)));
              if (e.key === "Enter") choose(shown[idx]);
              if (e.key === "Escape") setPaletteOpen(false);
            }}
            placeholder="输入命令，如：深色、评测、导出…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1 scroll-thin">
          {shown.length === 0 && <div className="px-4 py-6 text-center text-sm text-faint">没有匹配的命令</div>}
          {shown.map((a, i) => (
            <button
              key={a.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(a)}
              className={cx("flex w-full items-center gap-3 px-4 py-2 text-left text-sm", i === idx && "bg-accent-soft")}
            >
              <span className="w-10 shrink-0 text-xs text-faint">{a.group}</span>
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              {a.hint && <span className="hidden truncate text-xs text-faint sm:inline">{a.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Shell({ children, actions, paletteActions }: { children: ReactNode; actions?: ReactNode; paletteActions: PaletteAction[] }) {
  const { health, setPaletteOpen } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <NavRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar actions={actions} />
        {health && !health.llm_configured && (
          <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-2 text-sm text-warn">
            <CircleAlert size={15} className="shrink-0" />
            没有配置模型 API Key。复制 <code className="font-mono">.env.example</code> 为 <code className="font-mono">.env</code>，填入 Key 后重启服务，可运行 <code className="font-mono">proven doctor</code> 检查。
          </div>
        )}
        {/* On phones the panes stack vertically, so the content scrolls above the bottom nav bar. */}
        <div className="min-h-0 flex-1 max-md:overflow-y-auto">{children}</div>
      </div>
      <CommandPalette extra={paletteActions} />
    </div>
  );
}
