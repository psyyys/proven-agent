import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Search, Table2 } from "lucide-react";
import { api } from "../../lib/api";
import type { TableProfile, TableRows } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Bar, Button, Card, cx, Empty, Input, Segmented, Spinner } from "../../ui/kit";
import { DataTable } from "../analysis/CellView";

const PAGE = 50;

export function DataView() {
  const { session, setView, fail } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<TableProfile | null>(null);
  const [rows, setRows] = useState<TableRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<"columns" | "rows">("columns");
  const [colFilter, setColFilter] = useState("");

  const tables = session?.tables ?? [];
  useEffect(() => {
    if (!selected && tables.length) setSelected(tables[0].name);
  }, [tables, selected]);

  useEffect(() => {
    if (!session || !selected) return;
    setProfile(null);
    api.table(session.id, selected).then(setProfile).catch(fail);
    setOffset(0);
  }, [session, selected, fail]);

  useEffect(() => {
    if (!session || !selected || tab !== "rows") return;
    setRows(null);
    api.rows(session.id, selected, offset, PAGE).then(setRows).catch(fail);
  }, [session, selected, offset, tab, fail]);

  const columns = useMemo(
    () => (profile?.columns ?? []).filter((c) => c.name.toLowerCase().includes(colFilter.trim().toLowerCase())),
    [profile, colFilter],
  );
  const nullMax = Math.max(1, ...(profile?.columns ?? []).map((c) => c.nulls));

  if (!session) return <Empty icon={<Spinner />} title="正在启动会话" />;
  if (!tables.length)
    return (
      <Empty icon={<Database size={28} />} title="还没有加载数据">
        到"分析"页面左侧加载示例数据，或上传 CSV / Excel 文件。
        <div className="mt-3">
          <Button size="sm" onClick={() => setView("analysis")}>
            去加载数据
          </Button>
        </div>
      </Empty>
    );

  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="shrink-0 overflow-y-auto border-line bg-panel p-3 scroll-thin max-md:max-h-48 max-md:border-b md:w-64 md:border-r">
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">数据表 · {tables.length}</div>
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => setSelected(t.name)}
            className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm", selected === t.name ? "bg-accent-soft text-accent" : "hover:bg-sunken")}
          >
            <Table2 size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[0.82rem]">{t.name}</span>
              <span className="block truncate text-[0.7rem] text-faint">
                {t.rows.toLocaleString()} 行 · {t.columns} 列 · {t.file}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 scroll-thin sm:p-6">
        {!profile ? (
          <Spinner label="读取表结构…" />
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-lg font-semibold">{profile.name}</h2>
              <Badge>{profile.rows.toLocaleString()} 行</Badge>
              <Badge>{profile.columns.length} 列</Badge>
              {profile.columns.some((c) => c.nulls) && <Badge tone="warn">{profile.columns.filter((c) => c.nulls).length} 列有缺失</Badge>}
              <div className="ml-auto">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "columns", label: "字段画像" },
                    { value: "rows", label: "数据预览" },
                  ]}
                />
              </div>
            </div>

            {tab === "columns" ? (
              <Card
                title="字段"
                actions={
                  <div className="relative w-48">
                    <Search size={13} className="absolute left-2 top-2 text-faint" />
                    <Input value={colFilter} onChange={(e) => setColFilter(e.target.value)} placeholder="筛选字段" className="h-7 pl-7 text-xs" />
                  </div>
                }
                bodyClassName="p-0"
              >
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-faint">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 font-medium">字段</th>
                        <th className="px-2 py-2 font-medium">类型</th>
                        <th className="w-40 px-2 py-2 font-medium">缺失</th>
                        <th className="px-2 py-2 text-right font-medium">唯一值</th>
                        <th className="px-4 py-2 font-medium">分布</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((c) => (
                        <tr key={c.name} className="border-b border-line last:border-0">
                          <td className="px-4 py-2 font-mono text-[0.82rem]">{c.name}</td>
                          <td className="px-2 py-2 text-xs text-muted">{c.dtype}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <span className={cx("w-12 text-right text-xs tabular-nums", c.nulls ? "text-warn" : "text-faint")}>{c.nulls.toLocaleString()}</span>
                              {c.nulls > 0 && <Bar value={c.nulls} max={nullMax} tone="warn" />}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-xs tabular-nums text-muted">{c.unique.toLocaleString()}</td>
                          <td className="px-4 py-2 text-xs text-muted">
                            {c.min !== undefined ? `${fmt(c.min)} ~ ${fmt(c.max)}，均值 ${fmt(c.mean)}` : (c.top ?? []).join(" / ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card
                title="数据预览"
                actions={
                  rows && (
                    <>
                      <span className="text-xs tabular-nums text-muted">
                        {offset + 1}–{Math.min(offset + PAGE, rows.total)} / {rows.total.toLocaleString()}
                      </span>
                      <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} />
                      <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />} disabled={offset + PAGE >= rows.total} onClick={() => setOffset(offset + PAGE)} />
                    </>
                  )
                }
              >
                {rows ? <DataTable table={rows} maxRows={PAGE} /> : <Spinner label="读取数据…" />}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
