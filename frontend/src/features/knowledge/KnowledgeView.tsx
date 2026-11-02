import { useState } from "react";
import { BookOpen, FileText, Search } from "lucide-react";
import { api } from "../../lib/api";
import type { Hit } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Button, Card, Empty, Input, Segmented, Spinner } from "../../ui/kit";

/** Inspect the knowledge base and try queries, showing how hybrid retrieval ranked each chunk. */
export function KnowledgeView() {
  const { session, fail } = useStore();
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("5");
  const [result, setResult] = useState<{ vector: boolean; rerank: boolean; hits: Hit[] } | null>(null);
  const [loading, setLoading] = useState(false);

  if (!session) return <Empty icon={<Spinner />} title="正在启动会话" />;

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResult(await api.searchKnowledge(session.id, query.trim(), Number(topK)));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title={`文档 · ${session.documents.length}`} bodyClassName="p-2">
          {session.documents.length ? (
            <div className="space-y-0.5">
              {session.documents.map((d) => (
                <div key={d.name} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
                  <FileText size={14} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate" title={d.name}>
                    {d.name}
                  </span>
                  <Badge>{d.origin === "pack" ? "领域包" : "上传"}</Badge>
                </div>
              ))}
              <div className="px-2 pt-2 text-xs text-faint">共 {session.knowledge_chunks} 个片段</div>
            </div>
          ) : (
            <Empty icon={<BookOpen size={22} />} title="没有文档">
              在分析页面上传 PDF、Word 或 Markdown，它们会被切块加入知识库。
            </Empty>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="检索测试">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="输入问题，如：样本较短时 Cs 怎么取" className="pl-8" />
              </div>
              <Segmented
                value={topK}
                onChange={setTopK}
                options={[
                  { value: "3", label: "3 条" },
                  { value: "5", label: "5 条" },
                  { value: "10", label: "10 条" },
                ]}
              />
              <Button variant="primary" onClick={search} loading={loading} disabled={!query.trim()}>
                检索
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="accent">BM25 关键词（jieba 分词）</Badge>
              <Badge tone={session.vector_search ? "accent" : "neutral"}>向量检索{session.vector_search ? "" : "：未配置"}</Badge>
              <Badge tone={result?.rerank ? "accent" : "neutral"}>重排{result?.rerank ? "" : "：未配置"}</Badge>
              <span className="text-faint">多路结果用 RRF 融合</span>
            </div>
          </Card>

          {result &&
            (result.hits.length ? (
              <div className="space-y-2">
                {result.hits.map((h, i) => (
                  <div key={h.id} className="rounded-xl border border-line bg-panel p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-accent">#{i + 1}</span>
                      <span className="font-mono font-semibold">{h.id}</span>
                      <span className="truncate text-muted">
                        {h.source}
                        {h.page ? ` · 第${h.page}页` : ""}
                        {h.heading ? ` · ${h.heading}` : ""}
                      </span>
                      <span className="ml-auto flex gap-1">
                        <Badge>融合 {h.score}</Badge>
                        {h.bm25_rank && <Badge>BM25 #{h.bm25_rank}</Badge>}
                        {h.vector_rank && <Badge>向量 #{h.vector_rank}</Badge>}
                        {h.rerank_score !== null && <Badge tone="accent">重排 {h.rerank_score}</Badge>}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{h.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="没有检索到相关内容" />
            ))}
        </div>
      </div>
    </div>
  );
}
