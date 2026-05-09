import { ArrowLeft, Folder, Play, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { formatRenderResolution } from "@/lib/format/render";
import type { RenderJob } from "@/lib/render/types";

type RenderHeadProps = {
  job: RenderJob | null;
  onBack: () => void;
  onCancel: () => void;
  onReveal: () => void;
  onRetry: () => void;
};

export function RenderHead({ job, onBack, onCancel, onReveal, onRetry }: RenderHeadProps) {
  const t = useTranslations("pages.render");
  const phase = job?.phase ?? "idle";
  const titleKey = phase === "done" && job?.preset === "draft" ? "title.doneDraft" : `title.${phase}`;

  return (
    <header className="col-span-2 mb-[6px] flex items-end justify-between gap-4 max-lg:col-span-1">
      <div>
        <p className="mb-[6px] text-[11px] font-semibold uppercase tracking-[0.1em] text-(--text-3)">
          {t(`eyebrow.${job?.preset ?? "idle"}`)}
        </p>
        <h1 className="text-[24px] font-bold leading-tight tracking-normal text-(--text)">
          {t(titleKey, { resolution: job ? formatRenderResolution(job.preset) : "1080p" })}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onBack} size="extra-small" variant="ghost">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t("backToEditor")}
        </Button>
        {running(phase) ? (
          <Button className="text-(--red) hover:bg-(--red-bg)" onClick={onCancel} size="extra-small" variant="ghost">
            <X aria-hidden="true" className="h-4 w-4" />
            {t("cancel")}
          </Button>
        ) : null}
        {phase === "done" ? (
          <Button onClick={onReveal} size="extra-small" variant="ghost">
            <Folder aria-hidden="true" className="h-4 w-4" />
            {t("revealOutput")}
          </Button>
        ) : null}
        {phase === "error" ? (
          <Button onClick={onRetry} size="extra-small" variant="ghost">
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {t("retry")}
          </Button>
        ) : null}
        {phase === "cancelled" ? (
          <Button onClick={onRetry} size="extra-small" variant="ghost">
            <Play aria-hidden="true" className="h-4 w-4" />
            {t("startAgain")}
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function running(phase: string): boolean {
  return ["verifying", "prerender", "subtitles", "composing", "muxing"].includes(phase);
}
