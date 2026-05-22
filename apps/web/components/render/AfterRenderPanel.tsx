import { Folder, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import type { RenderJob } from "@/lib/render/types";
import { PanelHead } from "./OutputPanel";

type AfterRenderPanelProps = {
  job: RenderJob | null;
  onPlay: () => void;
  onReveal: () => void;
  revealEnabled: boolean;
};

export function AfterRenderPanel({ job, onPlay, onReveal, revealEnabled }: AfterRenderPanelProps) {
  const t = useTranslations("pages.render.after");
  const playable = job?.phase === "done" && job.outputExists;

  return (
    <section className="flex flex-col overflow-hidden rounded-[10px] border border-(--line) bg-(--bg-2)">
      <PanelHead title={t("head")} />
      <div className="flex flex-col gap-[8px] px-[14px] py-[14px]">
        <Button aria-disabled={!playable} disabled={!playable} onClick={onPlay} variant="ghost">
          <Play aria-hidden="true" className="h-4 w-4" />
          {t("playLocally")}
        </Button>
        {revealEnabled ? (
          <Button aria-disabled={!playable} disabled={!playable} onClick={onReveal} variant="ghost">
            <Folder aria-hidden="true" className="h-4 w-4" />
            {t("reveal")}
          </Button>
        ) : null}
        {!playable ? <p className="mt-[6px] text-[11px] text-(--text-4)">{t("hint")}</p> : null}
      </div>
    </section>
  );
}
