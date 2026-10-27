import { useEffect, useRef, useState } from "react";
import { ArrowUp, ListChecks, Sparkles, Square } from "lucide-react";
import { useStore } from "../../app/store";
import { cx, Kbd, Segmented } from "../../ui/kit";

export function Composer({ running, onAsk, onStop }: { running: boolean; onAsk: (q: string, confirmPlan: boolean, mode: "single" | "multi") => void; onStop: () => void }) {
  const { session, pack, prefs, setPref, settings } = useStore();
  const [question, setQuestion] = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const serverMode = settings?.mode ?? "single";
  const [mode, setMode] = useState<"single" | "multi">(prefs.defaultMode === "server" ? serverMode : prefs.defaultMode);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMode(prefs.defaultMode === "server" ? serverMode : prefs.defaultMode);
  }, [prefs.defaultMode, serverMode]);

  // "/" focuses the composer from anywhere outside an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        box.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const q = question.trim();
    if (!q || running || !session) return;
    onAsk(q, prefs.confirmPlan, mode);
    setQuestion("");
    setShowExamples(false);
  };

  return (
    <div className="shrink-0 border-t border-line bg-panel px-4 py-3">
      <div className="relative mx-auto max-w-3xl">
        {showExamples && pack && pack.examples.length > 0 && (
          <div className="pop-in absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-line bg-raised shadow-xl">
            <div className="border-b border-line px-3 py-2 text-xs text-faint">示例问题 · {pack.name}</div>
            {pack.examples.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuestion(ex);
                  setShowExamples(false);
                  box.current?.focus();
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-sunken"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl border border-line bg-panel shadow-sm transition-colors focus-within:border-accent">
          <textarea
            ref={box}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={session ? "问一个关于数据的问题…（Enter 发送，Shift+Enter 换行）" : "正在准备会话…"}
            disabled={!session}
            className="block max-h-48 min-h-14 w-full resize-y bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-faint"
          />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className={cx("flex items-center gap-1 rounded-md px-2 py-1 text-xs", showExamples ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken")}
            >
              <Sparkles size={13} /> 示例
            </button>
            <button
              onClick={() => setPref("confirmPlan", !prefs.confirmPlan)}
              title="开启后，Agent 先展示计划，等你确认（可修改）再执行"
              className={cx("flex items-center gap-1 rounded-md px-2 py-1 text-xs", prefs.confirmPlan ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken")}
            >
              <ListChecks size={13} /> 确认计划{prefs.confirmPlan ? "：开" : "：关"}
            </button>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "single", label: "单 Agent", title: "一个 ReAct 循环完成全部步骤" },
                { value: "multi", label: "多 Agent", title: "每个计划步骤派一个上下文独立的分析员" },
              ]}
            />
            <span className="ml-auto hidden text-xs text-faint sm:inline">
              <Kbd>/</Kbd> 聚焦
            </span>
            {running ? (
              <button onClick={onStop} title="停止" className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-panel">
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!question.trim() || !session}
                title="发送（Enter）"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
