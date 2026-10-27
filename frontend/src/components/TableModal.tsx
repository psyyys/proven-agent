import { X } from "lucide-react";
import type { TableProfile } from "../types";
import { DataTable } from "./CellView";

export function TableModal({ profile, onClose }: { profile: TableProfile; onClose: () => void }) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-panel shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span className="font-mono font-semibold">{profile.name}</span>
          <span className="text-sm text-muted">
            {profile.rows.toLocaleString()} 行 · {profile.columns.length} 列
          </span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-sunken">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 scroll-thin">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="pb-2 font-medium">字段</th>
                <th className="pb-2 font-medium">类型</th>
                <th className="pb-2 text-right font-medium">缺失</th>
                <th className="pb-2 text-right font-medium">唯一值</th>
                <th className="pb-2 pl-4 font-medium">分布</th>
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((c) => (
                <tr key={c.name} className="border-t border-line">
                  <td className="py-1.5 font-mono text-[0.82rem]">{c.name}</td>
                  <td className="py-1.5 text-xs text-muted">{c.dtype}</td>
                  <td className={`py-1.5 text-right tabular-nums ${c.nulls ? "text-warn" : "text-faint"}`}>{c.nulls.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{c.unique.toLocaleString()}</td>
                  <td className="py-1.5 pl-4 text-xs text-muted">
                    {c.min !== undefined ? `${fmt(c.min)} ~ ${fmt(c.max)}，均值 ${fmt(c.mean)}` : (c.top ?? []).join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {profile.sample.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium text-faint">样例</div>
              <DataTable table={{ columns: Object.keys(profile.sample[0]), rows: profile.sample }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
