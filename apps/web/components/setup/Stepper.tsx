import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SetupDraft } from "@vc/shared-schemas";

type StepperProps = {
  draft: SetupDraft;
  onAlignmentClick?: () => void;
  onProjectClick?: () => void;
  onSubtitleClick?: () => void;
  onVoiceClick?: () => void;
  subtitleVisible?: boolean;
};

export function Stepper({
  draft,
  onAlignmentClick,
  onProjectClick,
  onSubtitleClick,
  onVoiceClick,
  subtitleVisible = false,
}: StepperProps) {
  const t = useTranslations("pages.setup.steps");
  const projectDone = Boolean(draft.name.trim());
  const voiceDone = draft.voice?.state === "copied";
  const subtitleDone = draft.subtitle_generation.status === "succeeded";
  const alignmentDone = draft.alignment.status === "aligned";
  const activeStep = !projectDone ? 1 : !voiceDone ? 2 : !subtitleDone ? 3 : !alignmentDone ? 4 : 0;

  return (
    <ol className="sticky top-[20px] m-0 flex list-none flex-col gap-[10px] p-0">
      <StepButton
        done={projectDone}
        index={1}
        onClick={onProjectClick}
        state={projectDone ? "done" : activeStep === 1 ? "active" : "locked"}
        title={t("projectName")}
      />
      <StepButton
        done={voiceDone}
        index={2}
        onClick={onVoiceClick}
        state={voiceDone ? "done" : activeStep === 2 ? "active" : "locked"}
        title={t("voice")}
      />
      <StepButton
        done={subtitleDone}
        index={3}
        onClick={onSubtitleClick}
        state={subtitleDone ? "done" : activeStep === 3 ? "active" : "locked"}
        title={t("subtitle")}
      />
      <StepButton
        done={alignmentDone}
        index={4}
        onClick={subtitleVisible ? onAlignmentClick : undefined}
        state={alignmentDone ? "done" : activeStep === 4 ? "active" : "locked"}
        title={t("alignment")}
      />
    </ol>
  );
}

function StepButton({
  done,
  index,
  onClick,
  state,
  title,
}: {
  done: boolean;
  index: number;
  onClick?: () => void;
  state: "active" | "done" | "locked";
  title: string;
}) {
  const active = state === "active";
  const locked = state === "locked";

  return (
    <li>
      <button
        className={`grid w-full grid-cols-[34px_1fr] items-center gap-[10px] rounded-(--r-md) px-[12px] py-[10px] text-left text-[13px] transition-[background,color] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber) ${
          active ? "bg-(--bg-2) text-(--text)" : locked ? "text-(--text-4)" : "text-(--text-2)"
        }`}
        disabled={!onClick}
        onClick={onClick}
        type="button"
      >
        <span
          className={`grid h-[24px] w-[24px] place-items-center rounded-(--r-pill) border font-mono text-[11px] font-semibold ${
            done
              ? "border-(--green) bg-(--green) text-(--bg-0)"
              : active
                ? "border-(--text) bg-(--text) text-(--bg-0)"
                : "border-(--bg-3) bg-(--bg-3) text-(--text-4)"
          }`}
        >
          {done ? <Check aria-hidden="true" className="h-[13px] w-[13px]" /> : index}
        </span>
        <span className="min-w-0 font-medium">{title}</span>
      </button>
    </li>
  );
}
