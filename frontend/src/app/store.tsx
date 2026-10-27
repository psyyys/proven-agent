/** App-wide state: server info, the current session, runs and their event streams, preferences. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, streamEvents } from "../lib/api";
import { usePrefsState, useApplyPrefs, type Prefs } from "../lib/prefs";
import type { AgentEvent, Health, Pack, RunMeta, RuntimeSettings, SessionInfo } from "../lib/types";
import { useToast } from "../ui/kit";

export type ViewId = "analysis" | "data" | "knowledge" | "experience" | "history" | "evals" | "settings";

interface Store {
  view: ViewId;
  setView: (v: ViewId) => void;
  health: Health | null;
  settings: RuntimeSettings | null;
  setSettings: (s: RuntimeSettings) => void;
  packs: Pack[];
  pack: Pack | undefined;
  packId: string;
  setPackId: (id: string) => void;
  session: SessionInfo | null;
  setSession: (s: SessionInfo) => void;
  newSession: () => void;
  runs: RunMeta[];
  activeRun: string | null;
  openRun: (id: string, question?: string) => void;
  addRun: (run: RunMeta) => void;
  events: Record<string, AgentEvent[]>;
  verified: Set<string>;
  markVerified: (id: string) => void;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  resetPrefs: () => void;
  fail: (e: unknown) => void;
  notify: (text: string, tone?: "info" | "ok" | "error") => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const { prefs, update: setPref, reset: resetPrefs } = usePrefsState();
  useApplyPrefs(prefs);

  const [view, setView] = useState<ViewId>("analysis");
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, AgentEvent[]>>({});
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const subs = useRef<Map<string, () => void>>(new Map());

  const fail = useCallback((e: unknown) => notify(e instanceof Error ? e.message : String(e), "error"), [notify]);
  const packId = prefs.pack;

  useEffect(() => {
    api.health().then(setHealth).catch(fail);
    api.settings().then(setSettings).catch(fail);
    api.packs().then(setPacks).catch(fail);
  }, [fail]);

  // A pack switch (or "new session") starts a fresh kernel, semantic layer and knowledge base.
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setSession(null);
    setRuns([]);
    setActiveRun(null);
    api
      .createSession(packId)
      .then((s) => {
        created = s.id;
        if (cancelled) api.deleteSession(s.id);
        else setSession(s);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (created) api.deleteSession(created);
    };
  }, [packId, sessionNonce, fail]);

  const subscribe = useCallback((runId: string) => {
    if (subs.current.has(runId)) return;
    setEvents((prev) => (prev[runId] ? prev : { ...prev, [runId]: [] }));
    const close = streamEvents(runId, (e) => setEvents((prev) => ({ ...prev, [runId]: [...(prev[runId] ?? []), e] })));
    subs.current.set(runId, close);
  }, []);

  const openRun = useCallback(
    (id: string, question?: string) => {
      if (question) setRuns((rs) => (rs.some((r) => r.id === id) ? rs : [...rs, { id, question }]));
      setActiveRun(id);
      subscribe(id);
      setView("analysis");
    },
    [subscribe],
  );

  const value = useMemo<Store>(
    () => ({
      view,
      setView,
      health,
      settings,
      setSettings,
      packs,
      pack: packs.find((p) => p.id === packId),
      packId,
      setPackId: (id) => setPref("pack", id),
      session,
      setSession,
      newSession: () => setSessionNonce((n) => n + 1),
      runs,
      activeRun,
      openRun,
      addRun: (run) => setRuns((rs) => [...rs, run]),
      events,
      verified,
      markVerified: (id) => setVerified((s) => new Set(s).add(id)),
      prefs,
      setPref,
      resetPrefs,
      fail,
      notify,
      paletteOpen,
      setPaletteOpen,
    }),
    [view, health, settings, packs, packId, session, runs, activeRun, openRun, events, verified, prefs, setPref, resetPrefs, fail, notify, paletteOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
