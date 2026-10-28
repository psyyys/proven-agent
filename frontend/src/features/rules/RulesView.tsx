import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, FlaskConical, Play, RefreshCw, Scale, Search } from "lucide-react";
import { api } from "../../lib/api";
import type { ReviewEvalListItem, ReviewEvalReport, Rule, RuleSetInfo } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Button, Card, cx, Empty, Input, Kbd, Segmented, Spinner } from "../../ui/kit";

const TYPE_LABEL: Record<string, string> = { range: "取值范围", condition: "适用条件", consistency: "文字与数字一致" };
const FACT_LABEL: Record<string, string> = {
  p_value: "p 值",
  correlation: "相关系数",
  sample_size: "样本长度",
  return_period: "重现期",
  cs_cv: "Cs/Cv",
};
const SCOPE_LABEL: Record<string, string> = { claim: "结论", evidence: "证据代码和输出", run: "同次分析的其他结论" };

function factName(f: unknown): string {
  if (typeof f === "string") return FACT_LABEL[f] ?? f;
  if (f && typeof f === "object" && "labels" in f) return String((f as { labels: string[] }).labels[0]);
  return String(f);
}

/** A rule's check in words, e.g. "取值在 0–1 之间" or "需要提到：水文年、日历年". */
function describeCheck(c: Record<string, any>): string {
  const unit = c.percent ? "%" : "";
  const bounds =
    "min" in c && "max" in c ? `在 ${c.min}${unit}–${c.max}${unit} 之间` : "min" in c ? `不小于 ${c.min}${unit}` : "max" in c ? `不大于 ${c.max}${unit}` : "";
  const abs = "abs_min" in c ? `绝对值不小于 ${c.abs_min}` : "";
  const scope = c.in ? `（在${[].concat(c.in).map((s: string) => SCOPE_LABEL[s] ?? s).join("、")}中查找）` : "";
  const missing = c.if_missing && c.if_missing !== "pass" ? `；找不到时记为${c.if_missing === "error" ? "错误" : "警告"}` : "";
  if (c.mention_any) {
    const terms = (c.mention_any as string[]).filter((t) => !t.startsWith("re:"));
    const extra = (c.mention_any as string[]).length - terms.length;
    return `需要提到：${terms.slice(0, 8).join("、")}${extra ? ` 等（另有 ${extra} 个模式）` : ""}${scope}`;
  }
  if (c.ratio) return `${factName(c.ratio.of)} ÷ ${factName(c.ratio.to)} 不大于 ${c.ratio.max}${missing}`;
  if (c.fact) return `${factName(c.fact)}${[bounds, abs].filter(Boolean).join("，")}${scope}${missing}`;
  return `紧跟在触发词后的数值${bounds}${c.skip_percent ? "（百分比形式的变化率不检查）" : ""}`;
}

function RuleCard({ rule }: { rule: Rule }) {
  const pending = rule.basis.includes("待核实") || rule.basis.includes("待补充") || !rule.basis;
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-accent">{rule.id}</span>
        <span className="font-medium">{rule.name}</span>
        <Badge tone={rule.severity === "error" ? "bad" : "warn"}>{rule.severity === "error" ? "错误 · 退回重做" : "警告 · 写入局限"}</Badge>
        <Badge>{TYPE_LABEL[rule.type] ?? rule.type}</Badge>
        <span className="ml-auto text-xs text-faint">{rule.source === "general" ? "通用规则" : "领域规则"}</span>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[5rem_1fr]">
        <dt className="text-faint">触发词</dt>
        <dd className="flex flex-wrap gap-1">
          {rule.applies_when.map((t) => (
            <span key={t} className="rounded bg-sunken px-1.5 py-px font-mono text-[0.7rem]">
              {t}
            </span>
          ))}
        </dd>
        <dt className="text-faint">检查</dt>
        <dd>{describeCheck(rule.check)}</dd>
        {rule.unless_mention.length > 0 && (
          <>
            <dt className="text-faint">豁免</dt>
            <dd className="text-muted">结论中写了 {rule.unless_mention.slice(0, 6).join("、")}{rule.unless_mention.length > 6 ? " 等" : ""} 时不检查</dd>
          </>
        )}
        <dt className="text-faint">提示语</dt>
        <dd className="text-muted">{rule.message}</dd>
        <dt className="text-faint">依据</dt>
        <dd className={pending ? "text-warn" : "text-muted"}>{rule.basis || "（未填写）"}</dd>
      </dl>
    </div>
  );
}

function TrapReport({ report }: { report: ReviewEvalReport }) {
  const s = report.summary;
  const tile = (label: string, value: string, sub: string, tone?: string) => (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs text-faint">{label}</div>
      <div className={cx("text-xl font-semibold tabular-nums", tone)}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("拦截率", `${s.catch_rate_pct}%`, `${s.caught}/${s.expected} 个应拦问题`, s.catch_rate_pct === 100 ? "text-ok" : undefined)}
        {tile("误拦率", `${s.false_positive_rate_pct}%`, `${s.false_positive_cases} 条用例有多余拦截`, s.false_positive_cases ? "text-bad" : "text-ok")}
        {tile("正确结论被误拦", `${s.clean_flagged}/${s.clean_cases}`, "越少越好")}
        {tile("模型拦截", s.llm_caught, `规则覆盖不到的问题 ${s.not_covered_by_rules} 条`)}
      </div>
      <Card title={`逐条结果 · ${report.pack} · ${report.mode === "full" ? "规则 + 模型" : "只用规则"} · ${report.time}`} bodyClassName="p-0">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">编号</th>
                <th className="px-2 py-2 font-medium">结论</th>
                <th className="px-2 py-2 font-medium">应拦</th>
                <th className="px-2 py-2 font-medium">实际</th>
                <th className="px-4 py-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      {r.passed ? <CircleCheck size={15} className="text-ok" /> : <CircleX size={15} className="text-bad" />}
                      <span className="font-mono text-xs">{r.id}</span>
                    </span>
                  </td>
                  <td className="max-w-md px-2 py-2">{r.claim}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{r.expect.join(", ") || "—"}</td>
                  <td className={cx("whitespace-nowrap px-2 py-2 font-mono text-xs", !r.passed && "text-bad")}>{r.fired.join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {!r.passed && (
                      <span className="mr-1 text-bad">
                        {r.missed.length ? `漏拦 ${r.missed.join(",")}` : ""}
                        {r.extra.length ? ` 误拦 ${r.extra.join(",")}` : ""}
                      </span>
                    )}
                    {r.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** The pack's review rules (written by a domain expert, applied by code) and the reviewer's trap test. */
export function RulesView() {
  const { packId, pack, fail, notify } = useStore();
  const [info, setInfo] = useState<RuleSetInfo | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [reports, setReports] = useState<ReviewEvalListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<ReviewEvalReport | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setInfo(null);
    api.rules(packId).then(setInfo).catch(fail);
  }, [packId, fail]);

  const loadReports = useCallback(
    (pick?: string) =>
      api
        .reviewEvals()
        .then((xs) => {
          const mine = xs.filter((x) => x.pack === packId);
          setReports(mine);
          setSelected(pick ?? mine[0]?.name ?? null);
        })
        .catch(fail),
    [packId, fail],
  );
  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!selected) return setReport(null);
    api.reviewEval(selected).then(setReport).catch(fail);
  }, [selected, fail]);

  const runTest = async () => {
    setRunning(true);
    try {
      const r = await api.runRulesEval(packId);
      notify(`拦截率 ${r.summary.catch_rate_pct}%，误拦率 ${r.summary.false_positive_rate_pct}%`, r.summary.false_positive_cases ? "info" : "ok");
      await loadReports(r.name);
    } catch (e) {
      fail(e);
    } finally {
      setRunning(false);
    }
  };

  const rules = (info?.rules ?? []).filter(
    (r) => (type === "all" || r.type === type) && [r.id, r.name, r.message, r.basis, ...r.applies_when].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
  );
  const errors = info?.rules.filter((r) => r.severity === "error").length ?? 0;

  return (
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold">审核规则</h2>
          <p className="text-xs text-muted">
            审核员的第一层：领域规则由专家编写、程序执行，结果确定，不消耗 Token。触发"错误"的结论会退回分析员重做一次，"警告"写进报告的"假设与局限"。
            当前领域包：{pack?.name}。规则文件：<code className="font-mono">proven/packs/{packId}/rules.yaml</code>
          </p>
        </div>

        {!info ? (
          <Spinner label="读取规则…" />
        ) : !info.ok ? (
          <Card>
            <div className="text-sm text-bad">规则文件有误：{info.error}</div>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-60">
                <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索编号、名称、触发词、依据" className="pl-8" />
              </div>
              <Segmented
                size="sm"
                value={type}
                onChange={setType}
                options={[
                  { value: "all", label: "全部" },
                  { value: "range", label: "取值范围" },
                  { value: "condition", label: "适用条件" },
                  { value: "consistency", label: "文字与数字" },
                ]}
              />
              <span className="ml-auto text-xs text-faint">
                {info.rules.length} 条（错误级 {errors}，警告级 {info.rules.length - errors}）
              </span>
            </div>
            {rules.length === 0 ? (
              <Card>
                <Empty icon={<Scale size={24} />} title={info.rules.length ? "没有匹配的规则" : "这个领域包还没有规则"}>
                  格式见 docs/domain-rules-template.md
                </Empty>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {rules.map((r) => (
                  <RuleCard key={r.id} rule={r} />
                ))}
              </div>
            )}
            {info.review_points.length > 0 && (
              <Card title="交给模型审核员的检查要点" actions={<span className="text-xs text-faint">规则写不出来的方法问题</span>}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {info.review_points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}

        <Card
          title={
            <span className="flex items-center gap-2">
              <FlaskConical size={15} className="text-accent" />
              陷阱测试
            </span>
          }
          actions={
            <>
              {reports.length > 1 && (
                <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} className="h-7 rounded-md border border-line bg-panel px-2 text-xs">
                  {reports.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.time} · {r.mode === "full" ? "规则 + 模型" : "只用规则"} · {r.summary.catch_rate_pct}%
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => loadReports(selected ?? undefined)} />
              <Button size="sm" variant="primary" icon={<Play size={13} />} loading={running} onClick={runTest}>
                运行规则测试
              </Button>
            </>
          }
        >
          <p className="mb-3 text-xs text-muted">
            用例在 <code className="font-mono">proven/packs/{packId}/evals/review_cases.yaml</code>：一部分是故意写错的结论（应该被拦），一部分是正确结论（不应被拦）。
            这里只测规则，不调用模型；要连同模型审核一起测，在终端运行 <Kbd>proven review-eval --pack {packId} --llm</Kbd>。
            注意：现有用例和规则是一起写的，100% 只说明规则按设计工作；真实效果要用别人写的或真实运行中出现的错误结论来测。
          </p>
          {report ? <TrapReport report={report} /> : <div className="text-sm text-faint">还没有测试结果，点"运行规则测试"。</div>}
        </Card>
      </div>
    </div>
  );
}
