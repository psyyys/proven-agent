import type { AgentEvent, Health, Pack, Plan, SessionInfo, TableProfile } from "./types";

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export const api = {
  health: () => request<Health>("GET", "/api/health"),
  packs: () => request<Pack[]>("GET", "/api/packs"),
  createSession: (pack: string) => request<SessionInfo>("POST", "/api/sessions", { pack }),
  session: (sid: string) => request<SessionInfo>("GET", `/api/sessions/${sid}`),
  loadDataset: (sid: string, ds: string) =>
    request<{ tables: string[]; session: SessionInfo }>("POST", `/api/sessions/${sid}/datasets/${ds}`),
  upload: (sid: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return request<{ files: { kind: string; name: string; error?: string }[]; session: SessionInfo }>(
      "POST",
      `/api/sessions/${sid}/upload`,
      fd,
    );
  },
  table: (sid: string, name: string) => request<TableProfile>("GET", `/api/sessions/${sid}/tables/${encodeURIComponent(name)}`),
  startRun: (sid: string, question: string, autoApprove: boolean, mode?: string) =>
    request<{ id: string }>("POST", `/api/sessions/${sid}/runs`, { question, auto_approve: autoApprove, mode }),
  approve: (rid: string, plan?: Plan) => request("POST", `/api/runs/${rid}/approve`, { plan: plan ?? null }),
  cancel: (rid: string) => request("POST", `/api/runs/${rid}/cancel`),
  verify: (rid: string) => request<{ experience_id: number }>("POST", `/api/runs/${rid}/verify`),
  notebookUrl: (sid: string) => `/api/sessions/${sid}/notebook`,
  logUrl: (rid: string) => `/api/runs/${rid}/log.md`,
};

/** Subscribe to a run's event stream. Reconnects resume after the last seen sequence number. */
export function streamEvents(runId: string, onEvent: (e: AgentEvent) => void): () => void {
  let last = 0;
  let closed = false;
  let es: EventSource | null = null;

  const connect = () => {
    es = new EventSource(`/api/runs/${runId}/events?after=${last}`);
    es.onmessage = (msg) => {
      const e: AgentEvent = JSON.parse(msg.data);
      if (e.seq <= last) return;
      last = e.seq;
      onEvent(e);
      if (e.type === "run.finished") {
        closed = true;
        es?.close();
      }
    };
    es.onerror = () => {
      es?.close();
      if (!closed) setTimeout(connect, 1500);
    };
  };
  connect();
  return () => {
    closed = true;
    es?.close();
  };
}
