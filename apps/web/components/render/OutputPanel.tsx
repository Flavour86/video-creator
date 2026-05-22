import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  formatBitrate,
  formatBytes,
  formatColor,
  formatDimensions,
  formatFps,
  formatRenderResolutionValue,
  truncateFilename,
} from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";

export function OutputPanel({ job, projectName }: { job: RenderJob | null; projectName: string }) {
  const t = useTranslations("pages.render.out");
  const manifest = job?.manifest;
  const sizeValue = job && manifest ? outputSizeValue(job, manifest.estimatedBytes, t) : "--";
  const sizeLabel = job ? outputSizeLabel(job, t) : t("estSize");
  const rows = job && manifest
    ? [
        [t("project"), projectName],
        [t("file"), truncateFilename(job.filename, 18)],
        [t("resolution"), `${formatRenderResolutionValue(job.resolution, job.preset)} (${formatDimensions(manifest.width, manifest.height)})`],
        [t("framerate"), formatFps(manifest.fps)],
        [t("videoCodec"), manifest.codec],
        [t("crf"), `CRF ${manifest.crf}`],
        [t("preset"), manifest.preset],
        [t("audioCodec"), manifest.audioCodec],
        [t("bitrate"), formatBitrate(manifest.audioBitrate)],
        [t("sampleRate"), "48 kHz"],
        [t("color"), formatColor(manifest.colorMatrix, manifest.pixfmt)],
        [sizeLabel, sizeValue],
      ]
    : [[t("project"), projectName], [t("file"), "--"]];

  return (
    <section className="flex flex-col overflow-hidden rounded-[10px] border border-(--line) bg-(--bg-2)">
      <PanelHead title={t("head")} />
      <div className="flex flex-col gap-[10px] px-[14px] py-[14px] text-[12px]">
        {rows.map(([key, value]) => (
          <div className="flex items-center justify-between gap-4" key={key}>
            <span className="text-[11.5px] text-(--text-3)">{key}</span>
            <span className="truncate font-mono text-[11.5px] text-(--text-2)" title={value}>{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function outputSizeValue(job: RenderJob, estimatedBytes: number, t: ReturnType<typeof useTranslations>): string {
  if (job.outputExists && job.bytes != null) return formatBytes(job.bytes);
  if (job.phase === "done" || job.phase === "outputMissing") return t("missingOutput");
  if (job.phase === "partialExcluded") return t("partialExcluded");
  if (job.phase === "failed" || job.phase === "ffmpegFatalError") return t("unavailable");
  return formatBytes(estimatedBytes, { approx: true });
}

function outputSizeLabel(job: RenderJob, t: ReturnType<typeof useTranslations>): string {
  const terminalWithoutOutput =
    job.phase === "done" ||
    job.phase === "outputMissing" ||
    job.phase === "partialExcluded" ||
    job.phase === "failed" ||
    job.phase === "ffmpegFatalError";
  return job.outputExists || terminalWithoutOutput ? t("size") : t("estSize");
}

export function PanelHead({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-(--line) px-[14px] py-[10px]">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-2)">{title}</h2>
      {action}
    </div>
  );
}
