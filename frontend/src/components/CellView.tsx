import { useState } from "react";
import { ChevronDown, ChevronRight, Code2, TriangleAlert } from "lucide-react";
import type { Cell, CellOutput } from "../types";
import { Plot } from "./Plot";

export function DataTable({ table, maxRows = 12 }: { table: { columns: string[]; rows: Record<string, unknown>[] }; maxRows?: number }) {
  const rows = table.rows.slice(0, maxRows);
  const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 })) : String(v));
  return (
    <div className="overflow-x-auto rounded-md border border-line scroll-thin">
      <table className="w-full text-xs">
        <thead className="bg-sunken text-muted">
          <tr>
            {table.columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {table.columns.map((c) => (
                <td key={c} className={`whitespace-nowrap px-2 py-1 ${typeof r[c] === "number" ? "text-right tabular-nums" : ""}`}>
                  {fmt(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > maxRows && <div className="border-t border-line px-2 py-1 text-xs text-faint">另有 {table.rows.length - maxRows} 行…</div>}
    </div>
  );
}

function Output({ o }: { o: CellOutput }) {
  if (o.kind === "figure") return <Plot fig={o.data} height={280} />;
  if (o.kind === "table") return <DataTable table={o.data} />;
  if (o.kind === "image") return <img src={`data:image/png;base64,${o.data}`} className="max-w-full rounded" />;
  return <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{o.text}</pre>;
}

export function CellView({ cell, defaultOpen = false }: { cell: Cell; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={`cell-${cell.cell_id}`} className="rounded-lg border border-line bg-panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-ink">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Code2 size={13} />
        <span className="font-mono font-semibold text-accent">{cell.cell_id}</span>
        <span className="truncate">{open ? "隐藏代码" : "查看代码"}</span>
        <span className="ml-auto tabular-nums text-faint">{cell.duration_ms} ms</span>
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto border-t border-line bg-sunken px-3 py-2 font-mono text-xs leading-relaxed scroll-thin">{cell.code}</pre>
      )}
      {(cell.stdout || cell.outputs.length > 0 || cell.error) && (
        <div className="space-y-2 border-t border-line px-3 py-2">
          {cell.stdout && <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed scroll-thin">{cell.stdout}</pre>}
          {cell.outputs.map((o, i) => (
            <Output key={i} o={o} />
          ))}
          {cell.error && (
            <div className="rounded-md bg-bad-soft px-2.5 py-2 text-xs text-bad">
              <div className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert size={13} />
                {cell.error.name}: {cell.error.value}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
