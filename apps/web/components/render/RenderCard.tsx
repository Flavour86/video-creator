import { useTranslations } from "next-intl";
import { formatRenderFilename, formatRenderSpecs } from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { BigBar } from "./BigBar";
import { RenderStats } from "./RenderStats";
import { StagesList } from "./StagesList";

export function RenderCard({ job }: { job: RenderJob | null }) {
  const t = useTranslations("pages.render");
  const filename = job ? job.filename || formatRenderFilename(job.preset, job.startedAt) : t("idleFilename");
  const specs = job ? formatRenderSpecs(job.manifest) : t("idleSpecs");

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
      <RenderStats job={job} />
      <StagesList job={job} />
      {job?.phase === "error" ? <p className="mt-4 rounded border border-(--red-line) bg-(--red-bg) px-3 py-2 text-sm text-(--text)">{t("errorHint")}</p> : null}
    </section>
  );
}

function tagVariant(phase: RenderJob["phase"] | undefined): StatusTagVariant {
  if (phase === "done") return "ready";
  if (phase === "error") return "error";
  if (phase === "cancelled") return "idle";
  if (phase === "composing" || phase === "muxing") return "warning";
  return "info";
}

function tagKey(phase: RenderJob["phase"] | undefined): string {
  if (phase === "done") return "done";
  if (phase === "error") return "failed";
  if (phase === "cancelled") return "cancelled";
  if (phase === "composing") return "composing";
  if (phase === "muxing") return "muxing";
  return "preparing";
}
