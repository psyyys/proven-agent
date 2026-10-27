import { useCallback, useEffect, useState } from "react";

/** Per-browser preferences. Storage can be unavailable (private mode), so every access is guarded. */
export interface Prefs {
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  fontSize: "sm" | "md" | "lg";
  defaultMode: "server" | "single" | "multi";
  confirmPlan: boolean;
  autoScroll: boolean;
  showReasoning: boolean;
  codeOpenByDefault: boolean;
  dockWidth: number;
  reportWidth: number;
  dockCollapsed: boolean;
  reportCollapsed: boolean;
  pack: string;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  density: "comfortable",
  fontSize: "md",
  defaultMode: "server",
  confirmPlan: true,
  autoScroll: true,
  showReasoning: false,
  codeOpenByDefault: false,
  dockWidth: 300,
  reportWidth: 460,
  dockCollapsed: false,
  reportCollapsed: false,
  pack: "business",
};

const KEY = "proven.prefs.v1";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefsState() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }, [prefs]);
  const update = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value })), []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);
  return { prefs, update, reset };
}

/** Apply theme / density / font size to the document root. */
export function useApplyPrefs(prefs: Prefs) {
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", prefs.theme);
    root.setAttribute("data-density", prefs.density);
    root.style.fontSize = { sm: "14.5px", md: "16px", lg: "17.5px" }[prefs.fontSize];
  }, [prefs.theme, prefs.density, prefs.fontSize]);
}
