import type { ReviewIssue } from "../../lib/types";
import { cx } from "../../ui/kit";

/** One review issue: which rule (or the model reviewer) flagged which finding, and why. */
export function IssueRow({ issue, compact }: { issue: ReviewIssue; compact?: boolean }) {
  const error = issue.severity === "error";
  return (
    <div className={cx("rounded-md border-l-2 py-1 pl-2.5 text-xs", error ? "border-bad" : "border-warn")}>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={cx("rounded px-1 font-mono text-[0.68rem] font-semibold", error ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
          {issue.rule_id || "审核员"} · {error ? "错误" : "警告"}
        </span>
        {!compact && <span className="font-mono text-faint">{issue.finding_id}</span>}
        <span className="text-ink">{issue.rule_id ? issue.name : issue.message}</span>
      </div>
      {issue.detail && <div className="mt-0.5 text-muted">{issue.detail}</div>}
      {issue.rule_id && <div className="mt-0.5 text-muted">{issue.message}</div>}
      {issue.suggestion && <div className="mt-0.5 text-muted">建议：{issue.suggestion}</div>}
      {issue.basis && !compact && <div className="mt-0.5 text-faint">依据：{issue.basis}</div>}
    </div>
  );
}
