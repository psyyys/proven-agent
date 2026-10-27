export interface PackDataset {
  id: string;
  name: string;
  description: string;
  files: string[];
  source: string;
  license: string;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  datasets: PackDataset[];
  examples: string[];
  knowledge: string[];
}

export interface Health {
  model: string;
  llm_configured: boolean;
  mode: "single" | "multi";
  embedding: boolean;
  rerank: boolean;
}

export interface SessionInfo {
  id: string;
  pack: string;
  tables: { name: string; rows: number; columns: number; file: string; dataset: string | null }[];
  documents: { name: string; origin: string; chunks?: number }[];
  knowledge_chunks: number;
  vector_search: boolean;
  runs: string[];
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  nulls: number;
  unique: number;
  min?: number | null;
  mean?: number | null;
  max?: number | null;
  top?: string[];
}

export interface TableProfile {
  name: string;
  rows: number;
  columns: ColumnProfile[];
  sample: Record<string, unknown>[];
}

export interface PlanStep {
  title: string;
  detail?: string;
}

export interface Plan {
  understanding?: string;
  answerable?: boolean;
  reason?: string;
  assumptions?: string[];
  steps: PlanStep[];
}

export interface CellOutput {
  kind: "text" | "table" | "figure" | "image";
  data: any;
  text: string;
}

export interface Cell {
  cell_id: string;
  code: string;
  stdout: string;
  stderr: string;
  outputs: CellOutput[];
  error: { name: string; value: string; traceback: string } | null;
  duration_ms: number;
  purpose?: string;
}

export interface Finding {
  id: string;
  claim: string;
  evidence_type: "cell" | "doc" | "mixed";
  evidence_id: string;
  value: number | null;
  numbers: number[];
}

export interface Hit {
  id: string;
  source: string;
  text: string;
  page: number | null;
  heading: string;
  score: number;
  bm25_rank: number | null;
  vector_rank: number | null;
  rerank_score: number | null;
}

export interface ReportCheck {
  checked: number;
  unsupported: { number: string; context: string; start: number; end: number }[];
  unknown_citations: string[];
  ok: boolean;
}

export interface AgentEvent {
  id: string;
  run_id: string;
  session_id: string;
  seq: number;
  ts: number;
  type: string;
  data: any;
}

export interface RunMeta {
  id: string;
  question: string;
}

export interface RuntimeSettings {
  model: string;
  base_url_host: string | null;
  embed_model: string | null;
  rerank_model: string | null;
  mode: "single" | "multi";
  step_budget: number;
  max_steps: number;
  llm_temperature: number;
  tool_output_chars: number;
  cell_timeout: number;
  limits: Record<string, [number, number]>;
}

export interface HistoryRun {
  run_id: string;
  time: string;
  question: string;
  pack: string;
  model: string;
  status: string;
  tokens: number;
  llm_calls: number;
  live: boolean;
}

export interface Experience {
  id: number;
  pack: string;
  question: string;
  code: string;
  created: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  accuracy_pct: number;
  by_type: Record<string, string>;
  avg_llm_calls: number;
  total_tokens: number;
  avg_seconds: number;
}

export interface EvalListItem {
  name: string;
  pack: string;
  model: string;
  mode: string;
  time: string;
  summary: EvalSummary;
}

export interface EvalResult {
  id: string;
  type: string;
  question: string;
  passed: boolean;
  expected: unknown;
  got: number[];
  status: string;
  note: string;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  seconds: number;
  run_id: string;
}

export interface EvalReport extends EvalListItem {
  results: EvalResult[];
}

export interface TableRows {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}
