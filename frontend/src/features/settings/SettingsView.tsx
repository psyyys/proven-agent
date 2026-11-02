import { useEffect, useState } from "react";
import { Monitor, Moon, RotateCcw, Save, Sun } from "lucide-react";
import { api } from "../../lib/api";
import type { RuntimeSettings } from "../../lib/types";
import { useStore } from "../../app/store";
import { Badge, Button, Card, Field, Input, Kbd, Segmented, Spinner, Switch } from "../../ui/kit";

type Editable = Pick<RuntimeSettings, "mode" | "review" | "lessons" | "step_budget" | "max_steps" | "llm_temperature" | "tool_output_chars" | "cell_timeout">;

const NUMERIC: { key: keyof Omit<Editable, "mode" | "review" | "lessons">; label: string; hint: string; step: number }[] = [
  { key: "step_budget", label: "每个分析员的轮数上限", hint: "多 Agent 模式下，每个计划步骤最多调用工具的轮数", step: 1 },
  { key: "max_steps", label: "单 Agent 最大步数", hint: "单 Agent 模式下整个分析最多调用工具的轮数", step: 1 },
  { key: "llm_temperature", label: "模型温度", hint: "越低越稳定，数据分析建议 0–0.3", step: 0.05 },
  { key: "tool_output_chars", label: "工具输出上限（字符）", hint: "超出部分存成文件，只把位置告诉模型", step: 500 },
  { key: "cell_timeout", label: "代码超时（秒）", hint: "单段代码运行超过这个时间会被中断", step: 10 },
];

export function SettingsView() {
  const { prefs, setPref, resetPrefs, settings, setSettings, health, fail, notify } = useStore();
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings)
      setDraft({
        mode: settings.mode,
        review: settings.review,
        lessons: settings.lessons,
        step_budget: settings.step_budget,
        max_steps: settings.max_steps,
        llm_temperature: settings.llm_temperature,
        tool_output_chars: settings.tool_output_chars,
        cell_timeout: settings.cell_timeout,
      });
  }, [settings]);

  const dirty = !!settings && !!draft && (Object.keys(draft) as (keyof Editable)[]).some((k) => draft[k] !== settings[k]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      setSettings(await api.patchSettings(draft));
      notify("运行参数已更新（重启服务后恢复为 .env 中的值）", "ok");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 scroll-thin sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <h2 className="text-lg font-semibold">设置</h2>

        <Card title="外观" actions={<span className="text-xs text-faint">保存在本浏览器</span>}>
          <div className="space-y-5">
            <Field label="主题">
              <Segmented
                value={prefs.theme}
                onChange={(v) => setPref("theme", v)}
                options={[
                  { value: "system", label: <span className="flex items-center gap-1.5"><Monitor size={13} />跟随系统</span> },
                  { value: "light", label: <span className="flex items-center gap-1.5"><Sun size={13} />浅色</span> },
                  { value: "dark", label: <span className="flex items-center gap-1.5"><Moon size={13} />深色</span> },
                ]}
              />
            </Field>
            <Field label="布局密度" hint="紧凑模式下时间线间距更小，一屏能看到更多步骤">
              <Segmented
                value={prefs.density}
                onChange={(v) => setPref("density", v)}
                options={[
                  { value: "comfortable", label: "舒适" },
                  { value: "compact", label: "紧凑" },
                ]}
              />
            </Field>
            <Field label="字号">
              <Segmented
                value={prefs.fontSize}
                onChange={(v) => setPref("fontSize", v)}
                options={[
                  { value: "sm", label: "小" },
                  { value: "md", label: "中" },
                  { value: "lg", label: "大" },
                ]}
              />
            </Field>
            <Field label="面板">
              <div className="space-y-3">
                <Switch checked={!prefs.dockCollapsed} onChange={(v) => setPref("dockCollapsed", !v)} label="显示左侧数据栏" />
                <Switch checked={!prefs.reportCollapsed} onChange={(v) => setPref("reportCollapsed", !v)} label="显示右侧报告栏" />
                <p className="text-xs text-faint">拖动面板之间的分隔线可以调整宽度。</p>
              </div>
            </Field>
          </div>
        </Card>

        <Card title="分析默认选项" actions={<span className="text-xs text-faint">保存在本浏览器</span>}>
          <div className="space-y-5">
            <Field label="执行模式" hint="新提问默认使用的模式，输入框下方可以随时切换">
              <Segmented
                value={prefs.defaultMode}
                onChange={(v) => setPref("defaultMode", v)}
                options={[
                  { value: "server", label: `跟随服务端（${settings?.mode === "multi" ? "多" : "单"} Agent）` },
                  { value: "single", label: "单 Agent" },
                  { value: "multi", label: "多 Agent" },
                ]}
              />
            </Field>
            <Field label="执行过程">
              <div className="space-y-3">
                <Switch checked={prefs.confirmPlan} onChange={(v) => setPref("confirmPlan", v)} label="执行前确认计划" description="Agent 先展示计划，你可以修改后再执行" />
                <Switch checked={prefs.autoScroll} onChange={(v) => setPref("autoScroll", v)} label="自动滚动到最新一步" />
                <Switch checked={prefs.codeOpenByDefault} onChange={(v) => setPref("codeOpenByDefault", v)} label="默认展开代码" />
                <Switch checked={prefs.showReasoning} onChange={(v) => setPref("showReasoning", v)} label="显示模型思考过程" description="仅对支持思考模式的模型有效（如 Qwen 思考模式、DeepSeek Reasoner）" />
              </div>
            </Field>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetPrefs}>
                恢复默认外观和选项
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="运行参数"
          actions={
            <>
              <span className="hidden text-xs text-faint sm:inline">作用于服务端，重启后恢复为 .env 中的值</span>
              <Button variant="primary" size="sm" icon={<Save size={13} />} disabled={!dirty} loading={saving} onClick={save}>
                保存
              </Button>
            </>
          }
        >
          {!draft || !settings ? (
            <Spinner label="读取中…" />
          ) : (
            <div className="space-y-5">
              <Field label="服务端默认模式">
                <Segmented
                  value={draft.mode}
                  onChange={(v) => setDraft({ ...draft, mode: v })}
                  options={[
                    { value: "single", label: "单 Agent" },
                    { value: "multi", label: "多 Agent" },
                  ]}
                />
              </Field>
              <Field label="审核员" hint="规则检查由程序执行，不消耗 Token；模型审核每次多一次模型调用（多 Agent 模式下每步一次）。有错误级问题时退回重做一次">
                <Segmented
                  value={draft.review}
                  onChange={(v) => setDraft({ ...draft, review: v })}
                  options={[
                    { value: "off", label: "关闭" },
                    { value: "rules", label: "只用领域规则" },
                    { value: "full", label: "规则 + 模型审核" },
                  ]}
                />
              </Field>
              <Field label="经验（反思员）" hint="学习：运行结束后由反思员从失败中总结教训（有失败时多一次模型调用）；只读：参考已有教训但不再学习；关闭：不参考也不学习">
                <Segmented
                  value={draft.lessons}
                  onChange={(v) => setDraft({ ...draft, lessons: v })}
                  options={[
                    { value: "off", label: "关闭" },
                    { value: "use", label: "只读" },
                    { value: "learn", label: "参考并学习" },
                  ]}
                />
              </Field>
              {NUMERIC.map((f) => {
                const [lo, hi] = settings.limits[f.key] ?? [0, 100];
                return (
                  <Field key={f.key} label={f.label} hint={`${f.hint}（${lo}–${hi}）`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={lo}
                        max={hi}
                        step={f.step}
                        value={draft[f.key]}
                        onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                        className="w-full accent-[var(--color-accent)]"
                      />
                      <Input
                        type="number"
                        min={lo}
                        max={hi}
                        step={f.step}
                        value={draft[f.key]}
                        onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                        className="w-24 tabular-nums"
                      />
                    </div>
                  </Field>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="模型与服务">
          {settings ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ["对话模型", settings.model],
                ["接口地址", settings.base_url_host ?? "（未设置）"],
                ["向量模型", settings.embed_model ?? "未配置（只用关键词检索）"],
                ["重排模型", settings.rerank_model ?? "未配置"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-faint">{k}</dt>
                  <dd className="truncate font-mono text-[0.82rem]">{v}</dd>
                </div>
              ))}
              <div className="sm:col-span-2">
                <Badge tone={health?.llm_configured ? "ok" : "warn"}>{health?.llm_configured ? "API Key 已配置" : "未配置 API Key"}</Badge>
                <span className="ml-2 text-xs text-muted">
                  模型、Key、接口地址在 <code className="font-mono">.env</code> 中修改，运行 <Kbd>proven doctor</Kbd> 检查连接。
                </span>
              </div>
            </dl>
          ) : (
            <Spinner />
          )}
        </Card>

        <Card title="快捷键">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["打开命令面板", "Ctrl K"],
              ["聚焦输入框", "/"],
              ["发送问题", "Enter"],
              ["换行", "Shift Enter"],
              ["关闭弹窗", "Esc"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span className="text-muted">{k}</span>
                <Kbd>{v}</Kbd>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
