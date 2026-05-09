import { useTranslations } from "next-intl";
import { formatCount, formatEta, formatPercent, formatRenderSpeed } from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";

export function RenderStats({ job }: { job: RenderJob | null }) {
  const t = useTranslations("pages.render.stats");
  const cells = [
    [formatPercent(job?.progress), t("complete")],
    [formatRenderSpeed(job?.speed), t("encodeSpeed")],
    [formatEta(job?.etaSec), t("eta")],
    [formatCount(job?.framesWritten), t("framesWritten")],
  ] as const;

  return (
    <div className="mt-[22px] grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-(--line) bg-(--line) lg:grid-cols-4">
      {cells.map(([strong, label]) => (
        <div className="flex flex-col gap-[2px] bg-(--bg-2) px-[16px] py-[14px]" key={label}>
          <strong className="font-mono text-[22px] font-semibold tracking-normal text-(--text)">{strong}</strong>
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-(--text-3)">{label}</span>
        </div>
      ))}
    </div>
  );
}
