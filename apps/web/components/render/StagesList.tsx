import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRenderStages } from "@/lib/render/normalize";
import type { RenderJob, RenderStageView } from "@/lib/render/types";

export function StagesList({ job }: { job: RenderJob | null }) {
  const stages = useRenderStages(job);

  return (
    <div className="mt-[22px] flex flex-col gap-px overflow-hidden rounded-[10px] border border-(--line) bg-(--line)">
      {stages.map((stage, index) => (
        <Stage index={index + 1} key={stage.labelKey} stage={stage} />
      ))}
    </div>
  );
}

function Stage({ index, stage }: { index: number; stage: RenderStageView }) {
  const t = useTranslations("pages.render.stage");
  const done = stage.state === "done";
  const active = stage.state === "active";
  const failed = stage.state === "failed";

  return (
    <div
      className="flex items-center gap-[12px] bg-(--bg-2) px-[14px] py-[11px] text-[12.5px] text-(--text-3) data-[active=true]:text-(--text) data-[done=true]:text-(--text-2)"
      data-active={active}
      data-done={done}
      data-failed={failed}
    >
      <span className={`grid h-[18px] w-[18px] place-items-center rounded-full border font-mono text-[10px] ${bubbleClass(stage.state)}`}>
        {done ? <Check aria-hidden="true" size={9} /> : failed ? <X aria-hidden="true" size={9} /> : index}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {t(stage.labelKey)}
      </span>
      <span className="truncate font-mono text-[12.5px] text-(--text-3)">{stage.detail}</span>
      <span className={`ml-auto font-mono text-[10.5px] ${active ? "text-(--amber)" : failed ? "text-(--red)" : "text-(--text-4)"}`}>
        {stage.when}
      </span>
    </div>
  );
}

function bubbleClass(state: RenderStageView["state"]): string {
  if (state === "done") return "border-(--green) bg-(--green) text-(--bg-0)";
  if (state === "active") return "animate-pulse-amber border-(--amber) bg-(--amber) text-(--bg-0)";
  if (state === "failed") return "border-(--red) bg-(--red) text-(--text)";
  return "border-(--bg-5) bg-(--bg-2) text-(--text-3)";
}
