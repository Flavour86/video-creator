import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  formatAudioChain,
  formatBytes,
  formatColor,
  formatDimensions,
  formatFps,
  formatVideoChain,
  truncateFilename,
} from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";

export function OutputPanel({ job }: { job: RenderJob | null }) {
  const t = useTranslations("pages.render.out");
  const manifest = job?.manifest;
  const rows = manifest
    ? [
        [t("file"), truncateFilename(job.filename, 18)],
        [t("resolution"), formatDimensions(manifest.width, manifest.height)],
        [t("framerate"), formatFps(manifest.fps)],
        [t("video"), formatVideoChain(manifest.codec, manifest.crf, manifest.preset)],
        [t("audio"), formatAudioChain(manifest.audioCodec, manifest.audioBitrate)],
        [t("color"), formatColor(manifest.colorMatrix, manifest.pixfmt)],
        [
          job.phase === "done" ? t("size") : t("estSize"),
          job.phase === "done" && !job.outputExists
            ? "missing output"
            : formatBytes(job.phase === "done" ? job.bytes : manifest.estimatedBytes, { approx: job.phase !== "done" }),
        ],
      ]
    : [[t("file"), "--"]];

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

export function PanelHead({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-(--line) px-[14px] py-[10px]">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-2)">{title}</h2>
      {action}
    </div>
  );
}
