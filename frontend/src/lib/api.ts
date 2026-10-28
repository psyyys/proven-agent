import type {
  AgentEvent,
  EvalListItem,
  EvalReport,
  Experience,
  Health,
  HistoryRun,
  Hit,
  Pack,
  Plan,
  ReviewEvalListItem,
  ReviewEvalReport,
  ReviewEvalSummary,
  RuleSetInfo,
  RuntimeSettings,
  SessionInfo,
  TableProfile,
  TableRows,
} from "./types";

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
    if (res.status >= 500 && detail === res.statusText) detail = `服务端出错（${res.status}），详情见运行 proven serve 的终端`;
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
  deleteSession: (sid: string) => fetch(`/api/sessions/${sid}`, { method: "DELETE" }),
  rows: (sid: string, name: string, offset: number, limit: number) =>
    request<TableRows>("GET", `/api/sessions/${sid}/tables/${encodeURIComponent(name)}/rows?offset=${offset}&limit=${limit}`),
  searchKnowledge: (sid: string, query: string, topK: number) =>
    request<{ vector: boolean; rerank: boolean; hits: Hit[] }>("POST", `/api/sessions/${sid}/knowledge/search`, { query, top_k: topK }),
  settings: () => request<RuntimeSettings>("GET", "/api/settings"),
  patchSettings: (patch: Partial<RuntimeSettings>) => request<RuntimeSettings>("PATCH", "/api/settings", patch),
  history: (limit = 100) => request<HistoryRun[]>("GET", `/api/history?limit=${limit}`),
  experiences: (pack: string) => request<Experience[]>("GET", `/api/experiences?pack=${encodeURIComponent(pack)}`),
  deleteExperience: (id: number) => request("DELETE", `/api/experiences/${id}`),
  evals: () => request<EvalListItem[]>("GET", "/api/evals"),
  evalReport: (name: string) => request<EvalReport>("GET", `/api/evals/${encodeURIComponent(name)}`),
  rules: (pack: string) => request<RuleSetInfo>("GET", `/api/packs/${encodeURIComponent(pack)}/rules`),
  reviewEvals: () => request<ReviewEvalListItem[]>("GET", "/api/review-evals"),
  reviewEval: (name: string) => request<ReviewEvalReport>("GET", `/api/review-evals/${encodeURIComponent(name)}`),
  runRulesEval: (pack: string) => request<{ name: string; summary: ReviewEvalSummary }>("POST", `/api/packs/${encodeURIComponent(pack)}/review-eval`),
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
