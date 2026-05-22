import { useTranslations } from "next-intl";
import { formatRenderFilename, formatRenderResolutionValue, formatRenderSpecs } from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { BigBar } from "./BigBar";
import { RenderStats } from "./RenderStats";
import { StagesList } from "./StagesList";

export function RenderCard({ job }: { job: RenderJob | null }) {
  const t = useTranslations("pages.render");
  const filename = job ? job.filename || formatRenderFilename(job.preset, job.startedAt) : t("idleFilename");
  const specs = job ? formatRenderSpecs(job.manifest) : t("idleSpecs");
  const phaseLabel = phaseTitle(job, t);

  return (
    <section className="col-start-1 row-start-2 flex flex-col self-start rounded-[10px] border border-(--line) bg-(--bg-2) p-[22px]">
      <div className="mb-[22px] flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <h2 className="mb-[4px] truncate font-mono text-[16px] font-semibold tracking-normal text-(--text)" title={filename}>
            {filename}
          </h2>
          <p className="truncate font-mono text-[11.5px] text-(--text-3)" title={specs}>
            {specs}
          </p>
        </div>
        <StatusTag className="shrink-0 font-mono text-[10.5px]" variant={tagVariant(job?.phase)}>
          {t(`tag.${tagKey(job?.phase)}`)}
        </StatusTag>
      </div>
      <BigBar job={job} />
      <p aria-live="polite" className="mt-[10px] text-[13px] font-medium text-(--text-2)">
        {phaseLabel}
      </p>
      <RenderStats job={job} />
      <StagesList job={job} />
      {job?.phase === "failed" || job?.phase === "ffmpegFatalError" ? <p className="mt-4 rounded border border-(--red-line) bg-(--red-bg) px-3 py-2 text-sm text-(--text)">{t("errorHint")}</p> : null}
    </section>
  );
}

function tagVariant(phase: RenderJob["phase"] | undefined): StatusTagVariant {
  if (phase === "done") return "ready";
  if (phase === "failed" || phase === "ffmpegFatalError" || phase === "outputMissing" || phase === "partialExcluded") return "error";
  if (phase === "ffmpegWarning") return "warning";
  if (phase === "cancelled") return "idle";
  if (phase === "composing" || phase === "muxing" || phase === "cancelling") return "warning";
  return "info";
}

function tagKey(phase: RenderJob["phase"] | undefined): string {
  if (phase === "done") return "done";
  if (phase === "failed" || phase === "ffmpegFatalError") return "failed";
  if (phase === "ffmpegWarning") return "warning";
  if (phase === "cancelled") return "cancelled";
  if (phase === "outputMissing") return "outputMissing";
  if (phase === "partialExcluded") return "partialExcluded";
  if (phase === "loggingHistory") return "loggingHistory";
  if (phase === "subtitles") return "subtitles";
  if (phase === "composing") return "composing";
  if (phase === "muxing") return "muxing";
  return "preparing";
}

function phaseTitle(job: RenderJob | null, t: ReturnType<typeof useTranslations>): string {
  const phase = job?.phase ?? "idle";
  const titleKey = phase === "done" && job?.preset === "draft" ? "doneDraft" : phase;
  return t(`title.${titleKey}`, {
    resolution: job ? formatRenderResolutionValue(job.resolution, job.preset) : "1080p",
  });
}
