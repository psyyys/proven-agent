import { useCallback, useEffect, useState } from "react";
import { Code2, Lightbulb, Pin, PinOff, Play, Plus, RotateCcw, Search, Sparkle, Trash2, Undo2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Experience, Lesson } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Bar, Button, Card, cx, Empty, Input, Segmented, Spinner, Tabs } from "../../ui/kit";
import { FAILURE_LABEL } from "../analysis/Timeline";

type Tab = "lessons" | "code";

function LessonCard({ x, onChange, onDelete, onOpenRun }: { x: Lesson; onChange: (patch: Partial<Lesson>) => void; onDelete: () => void; onOpenRun: (id: string) => void }) {
  const retired = x.status === "retired";
  return (
    <div className={cx("rounded-xl border bg-panel px-4 py-3", retired ? "border-line opacity-60" : "border-line")}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-mono text-sm font-semibold text-accent">{x.label}</span>
        <div className="min-w-0 flex-1">
          <p className={cx("text-sm", retired && "line-through")}>{x.text}</p>
          {x.when && <p className="mt-0.5 text-xs text-faint">适用：{x.when}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="ghost" title={x.pinned ? "取消固定（允许自动停用）" : "固定（不会被自动停用）"} icon={x.pinned ? <PinOff size={13} /> : <Pin size={13} />} onClick={() => onChange({ pinned: !x.pinned })} />
          <Button
            size="sm"
            variant="ghost"
            title={retired ? "重新启用" : "停用（以后不再放进提示词）"}
            icon={retired ? <RotateCcw size={13} /> : <Undo2 size={13} />}
            onClick={() => onChange({ status: retired ? "active" : "retired" })}
          />
          <Button size="sm" variant="danger" title="删除" icon={<Trash2 size={13} />} onClick={onDelete} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={x.scope === "all" ? "accent" : "neutral"}>{x.scope === "all" ? "通用" : "本领域"}</Badge>
        <Badge tone={x.origin === "manual" ? "ok" : "neutral"}>{x.origin === "manual" ? "手写" : `自动 · ${FAILURE_LABEL[x.category] ?? x.category}`}</Badge>
        {x.pinned && <Badge tone="ok">已固定</Badge>}
        {retired && <Badge tone="bad">已停用</Badge>}
        <span className="text-faint">总结 {x.hits} 次 · 使用 {x.uses} 次</span>
        {x.uses > 0 && (
          <span className="flex items-center gap-1.5 text-faint">
            · 有效 {x.helped} / 无效 {x.failed_after}
            <span className="inline-block w-16">
              <Bar value={x.score * 100} max={100} tone={x.score >= 0.5 ? "ok" : x.score >= 0.3 ? "warn" : "bad"} />
            </span>
          </span>
        )}
        {x.source_runs.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-faint">
            来源
            {x.source_runs.slice(-3).map((r) => (
              <button key={r} onClick={() => onOpenRun(r)} className="inline-flex items-center gap-0.5 font-mono text-accent hover:underline" title="回放这次运行">
                <Play size={10} />
                {r.slice(0, 6)}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function LessonsTab() {
  const { packId, pack, fail, notify, openRun } = useStore();
  const [items, setItems] = useState<Lesson[] | null>(null);
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ text: "", when: "", scope: "pack" as "pack" | "all" });

  const load = useCallback(() => {
    api.lessons(packId).then(setItems).catch(fail);
  }, [packId, fail]);
  useEffect(load, [load]);

  const change = async (id: number, patch: Partial<Lesson>) => {
    try {
      await api.patchLesson(id, patch);
      load();
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm("删除这条教训？")) return;
    try {
      await api.deleteLesson(id);
      load();
    } catch (e) {
      fail(e);
    }
  };
  const add = async () => {
    if (!draft.text.trim()) return;
    try {
      await api.addLesson(packId, draft.text.trim(), draft.when.trim(), draft.scope);
      setDraft({ text: "", when: "", scope: draft.scope });
      notify("已添加，以后相关的分析会参考它", "ok");
      load();
    } catch (e) {
      fail(e);
    }
  };

  const shown = (items ?? []).filter((x) => (status === "all" || x.status === status) && `${x.text} ${x.when}`.toLowerCase().includes(q.trim().toLowerCase()));
  const active = items?.filter((x) => x.status === "active").length ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        反思员在每次运行结束后读取失败记录（代码报错、结论被拒、核查或审核不通过），总结成教训；以后的运行会把相关的教训放进提示词。
        如果某条教训用过之后同样的失败还是出现，它会被降权，连续无效就自动停用。这不是训练模型，模型本身没有改变。当前领域包：{pack?.name}
      </p>
      <Card title="手写一条教训" actions={<span className="text-xs text-faint">手写的教训默认固定，不会被自动停用</span>}>
        <div className="flex flex-wrap gap-2">
          <Input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="做什么 / 不要做什么，如：流量 cfs 先乘 0.0283 换成 m³/s 再算径流深" className="min-w-64 flex-[3]" />
          <Input value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} placeholder="适用场景，如：计算径流系数时" className="min-w-40 flex-[2]" />
          <Segmented
            size="sm"
            value={draft.scope}
            onChange={(v) => setDraft({ ...draft, scope: v })}
            options={[
              { value: "pack", label: "本领域" },
              { value: "all", label: "通用" },
            ]}
          />
          <Button size="sm" variant="primary" icon={<Plus size={13} />} disabled={!draft.text.trim()} onClick={add}>
            添加
          </Button>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索教训" className="pl-8" />
        </div>
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: `可用 ${active}` },
            { value: "retired", label: "已停用" },
            { value: "all", label: "全部" },
          ]}
        />
      </div>
      {!items ? (
        <Spinner label="读取教训…" />
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={<Sparkle size={24} />} title={items.length ? "没有匹配的教训" : "还没有教训"}>
            分析中出现失败后，反思员会自动总结（设置 → 运行参数 → 经验）。也可以在上面手写一条。
          </Empty>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((x) => (
            <LessonCard key={x.id} x={x} onChange={(p) => change(x.id, p)} onDelete={() => remove(x.id)} onOpenRun={(r) => openRun(r, `教训 ${x.label} 的来源`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CodeTab() {
  const { packId, fail, notify } = useStore();
  const [items, setItems] = useState<Experience[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api.experiences(packId).then(setItems).catch(fail);
  }, [packId, fail]);
  useEffect(load, [load]);

  const remove = async (id: number) => {
    if (!window.confirm("删除这条经验？以后相似问题不会再参考它。")) return;
    try {
      await api.deleteExperience(id);
      notify("已删除", "ok");
      load();
    } catch (e) {
      fail(e);
    }
  };

  const shown = (items ?? []).filter((e) => (e.question + e.code).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">在报告下方点"分析正确，存入经验库"后，这次的代码会存到这里；遇到相似问题时 Agent 会先参考它。</p>
        <div className="relative ml-auto w-56">
          <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索问题或代码" className="pl-8" />
        </div>
      </div>
      {!items ? (
        <Spinner label="读取经验库…" />
      ) : shown.length === 0 ? (
        <Card>
          <Empty icon={<Lightbulb size={26} />} title={items.length ? "没有匹配的经验" : "还没有已验证的代码"}>
            完成一次分析、确认结果正确后，点报告下方的"分析正确，存入经验库"。
          </Empty>
        </Card>
      ) : (
        shown.map((e) => (
          <Card
            key={e.id}
            title={
              <span className="flex items-center gap-2">
                <Badge tone="accent">#{e.id}</Badge>
                <span className="font-normal">{e.question}</span>
              </span>
            }
            actions={
              <>
                <span className="text-xs text-faint">{new Date(e.created * 1000).toLocaleString("zh-CN")}</span>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {open === e.id ? "收起代码" : "查看代码"}
                </Button>
                <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => remove(e.id)} />
              </>
            }
            bodyClassName={open === e.id ? "p-0" : "hidden"}
          >
            <pre className="max-h-96 overflow-auto bg-sunken px-4 py-3 font-mono text-xs leading-relaxed scroll-thin">{e.code}</pre>
          </Card>
        ))
      )}
    </div>
  );
}

/** Two kinds of memory: lessons distilled from failures (phase 3) and code from runs the user verified. */
export function ExperienceView() {
  const [tab, setTab] = useState<Tab>("lessons");
  return (
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <h2 className="text-lg font-semibold">经验库</h2>
        <div className="border-b border-line">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "lessons", label: "教训", icon: <Sparkle size={15} /> },
              { id: "code", label: "已验证代码", icon: <Code2 size={15} /> },
            ]}
          />
        </div>
        {tab === "lessons" ? <LessonsTab /> : <CodeTab />}
      </div>
    </div>
  );
}
