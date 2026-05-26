import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type RenderStripProps = {
  job: EditorRenderJob;
  onCancel?: () => void;
};

const TERMINAL_LINGER_MS = 2_000;

export function RenderStrip({ job, onCancel }: RenderStripProps) {
  const t = useTranslations("pages.editor");
  const terminalKey = job.status === "ready" || job.status === "failed" || job.status === "cancelled"
    ? `${job.renderId ?? ""}:${job.status}`
    : null;
  const [hiddenTerminalKey, setHiddenTerminalKey] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalKey) {
      setHiddenTerminalKey(null);
      return;
    }
    const timeoutId = window.setTimeout(() => setHiddenTerminalKey(terminalKey), TERMINAL_LINGER_MS);
    return () => window.clearTimeout(timeoutId);
  }, [terminalKey]);

  if (job.status === "idle" || (terminalKey && hiddenTerminalKey === terminalKey)) return null;

  const percent = Math.max(0, Math.min(100, Math.round(job.progress)));
  const cancellable = (job.status === "queued" || job.status === "running") && Boolean(job.renderId);
  const statusLabel = statusLabelFor(job.status);
  const stageLabel = stageLabelFor(job);

  return (
    <div aria-live="polite" className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-(--line) bg-(--amber-bg) px-3 py-1.5 text-xs text-(--text-2)">
      <div className="min-w-0">
        <div className="mb-1 flex min-w-0 items-center gap-2 font-mono text-[11px]">
          <span className="shrink-0 font-semibold uppercase text-(--text)">{t("renderStripDraft", { phase: statusLabel })}</span>
          <span className="truncate">{stageLabel}</span>
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

function statusLabelFor(status: EditorRenderJob["status"]): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "ready":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "idle":
      return "";
  }
}

function stageLabelFor(job: EditorRenderJob): string {
  if (job.status === "failed") return "failed";
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "ready") return "done";
  const normalizedPhase = (job.phase || "").trim().toLowerCase();
  const normalizedMessage = (job.message || "").trim().toLowerCase();
  if (normalizedMessage.includes("building subtitles.srt")) return "building subtitles.srt";
  if (normalizedMessage.includes("pre-rendering clips")) return "pre-rendering clips";
  if (normalizedMessage.includes("verifying cache")) return "verifying cache";
  if (normalizedMessage.includes("ffmpeg compose")) return "ffmpeg compose";
  if (normalizedMessage.includes("muxing audio")) return "muxing audio";
  if (normalizedPhase === "cache_warm") return "verifying cache";
  if (normalizedPhase === "compose") return "ffmpeg compose";
  if (normalizedPhase === "muxing") return "muxing audio";
  if (normalizedPhase === "done" || normalizedPhase === "ready") return "done";
  if (normalizedPhase === "failed" || normalizedPhase === "error") return "failed";
  if (normalizedPhase === "cancelled") return "cancelled";
  if (normalizedPhase === "queued") return "queued";
  if (normalizedPhase) return normalizedPhase;
  return statusLabelFor(job.status);
}
