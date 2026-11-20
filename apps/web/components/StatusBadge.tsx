import { STATUS_LABEL, isReview, type StoryStatus } from "@storyforge/core";

export function StatusBadge({ status }: { status: string }) {
  const s = status as StoryStatus;
  const cls = isReview(s) ? "badge review" : s === "REJECTED" ? "badge bad" : s === "PUBLISHED" || s === "SCHEDULED" ? "badge ok" : "badge";
  return (
    <span className={cls} data-status={s}>
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}
