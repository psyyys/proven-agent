import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Experience } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Button, Card, Empty, Input, Spinner } from "../../ui/kit";

export function ExperienceView() {
  const { packId, pack, fail, notify } = useStore();
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
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">经验库</h2>
            <p className="text-xs text-muted">在报告下方点"分析正确，存入经验库"后，这次的代码会存到这里；遇到相似问题时 Agent 会先参考它。当前领域包：{pack?.name}</p>
          </div>
          <div className="relative ml-auto w-56">
            <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索问题或代码" className="pl-8" />
          </div>
        </div>
        {!items ? (
          <Spinner label="读取经验库…" />
        ) : shown.length === 0 ? (
          <Card>
            <Empty icon={<Lightbulb size={26} />} title={items.length ? "没有匹配的经验" : "经验库还是空的"}>
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
    </div>
  );
}
