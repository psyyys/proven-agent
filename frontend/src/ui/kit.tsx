/** Small, dependency-free UI primitives shared by every view. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, Loader2, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90 border border-transparent",
  secondary: "border border-line bg-panel text-ink hover:border-accent hover:text-accent",
  ghost: "border border-transparent text-muted hover:bg-sunken hover:text-ink",
  danger: "border border-line bg-panel text-bad hover:bg-bad-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, active, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "ok" | "warn" | "bad"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-sunken text-muted",
    accent: "bg-accent-soft text-accent",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: ReactNode; icon?: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
            value === t.id ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.icon}
          {t.label}
          {!!t.count && <span className="rounded-full bg-sunken px-1.5 text-xs tabular-nums text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Segmented control: a compact single choice among a few options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            value === o.value ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("h-8 w-full rounded-lg border border-line bg-panel px-2.5 text-sm outline-none placeholder:text-faint focus:border-accent", props.className)} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-sm font-medium text-muted">{title}</div>
      {children && <div className="max-w-sm text-xs leading-relaxed text-faint">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">{children}</kbd>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 size={15} className="animate-spin text-accent" />
      {label}
    </span>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-3xl" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className={cx("pop-in flex max-h-[84vh] w-full flex-col rounded-xl border border-line bg-panel shadow-2xl", width)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 font-semibold">{title}</div>
          <IconButton label="关闭" onClick={onClose} className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto scroll-thin">{children}</div>
      </div>
    </div>
  );
}

/** A thin bar used for small inline comparisons (usage per step, accuracy per type). */
export function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "ok" | "warn" | "bad" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const tones = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className={cx("h-full rounded-full", tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- toasts

type ToastTone = "info" | "ok" | "error";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone: ToastTone = "info") => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 8000 : 3500);
  }, []);
  const icons = { info: <Info size={16} />, ok: <CircleCheck size={16} />, error: <CircleAlert size={16} /> };
  const tones = { info: "border-line bg-raised text-ink", ok: "border-ok/30 bg-ok-soft text-ok", error: "border-bad/30 bg-bad-soft text-bad" };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx("pop-in pointer-events-auto flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg", tones[t.tone])}>
            <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{t.text}</span>
            <button className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
