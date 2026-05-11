import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type RenderStripProps = {
  job: EditorRenderJob;
  onCancel?: () => void;
};

export function RenderStrip({ job, onCancel }: RenderStripProps) {
  const t = useTranslations("pages.editor");
  if (job.status === "idle") return null;

  const percent = Math.max(0, Math.min(100, Math.round(job.progress)));
  const cancellable = (job.status === "queued" || job.status === "running") && Boolean(job.renderId);
  const label = labelForStatus(job.status);
  const stage = job.phase || job.message || label;

  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-(--line) bg-(--amber-bg) px-3 py-1.5 text-xs text-(--text-2)">
      <div className="min-w-0">
        <div className="mb-1 flex min-w-0 items-center gap-2 font-mono text-[11px]">
          <span className="shrink-0 font-semibold uppercase text-(--text)">{t("renderStripDraft", { phase: label })}</span>
          <span className="truncate">{stage}</span>
          <span className="ml-auto shrink-0">{percent}%</span>
        </div>
        <div
          aria-label={t("renderStripProgress")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-sm bg-(--bg-2)"
          role="progressbar"
        >
          <div className="h-full bg-(--amber) transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
      </div>
      {cancellable ? (
        <Button onClick={onCancel} size="extra-small" variant="ghost">
          {t("cancelRender")}
        </Button>
      ) : null}
    </div>
  );
}

function labelForStatus(status: EditorRenderJob["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "idle":
      return "";
  }
}
