import { useTranslations } from "next-intl";
import type { EditorRenderJob } from "./types";

export function RenderStrip({ job }: { job: EditorRenderJob }) {
  const t = useTranslations("pages.editor");
  if (!job.running) return null;
  return (
    <div className="flex h-7 items-center border-b border-(--line) bg-(--amber-bg) px-3 font-mono text-[11px] text-(--text-2)">
      {t("renderStripDraft", { phase: job.phase })}
    </div>
  );
}
