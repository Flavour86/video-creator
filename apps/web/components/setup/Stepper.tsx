import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SetupDraft } from "@vc/shared-schemas";

type StepperProps = {
  draft: SetupDraft;
  onAlignmentClick?: () => void;
  onProjectClick?: () => void;
  onSubtitleClick?: () => void;
  onVoiceClick?: () => void;
};

export function Stepper({ draft, onAlignmentClick, onProjectClick, onSubtitleClick, onVoiceClick }: StepperProps) {
  const t = useTranslations("pages.setup.steps");
  const projectDone = Boolean(draft.name.trim());
  const voiceDone = draft.voice?.state === "copied";
  const subtitleDone = draft.subtitle_generation.status === "succeeded";
  const alignmentDone = draft.alignment.status === "aligned";

  return (
    <ol className="sticky top-0 m-0 flex list-none flex-col gap-(--space-1) p-0">
      <StepButton
        done={projectDone}
        index={1}
        onClick={onProjectClick}
        state={projectDone ? "done" : "active"}
        sub={projectDone ? draft.name : t("projectNameSub")}
        title={t("projectName")}
      />
      <StepButton
        done={voiceDone}
        index={2}
        onClick={onVoiceClick}
        state={voiceDone ? "done" : "active"}
        sub={t("voiceSub")}
        title={t("voice")}
      />
      <StepButton
        done={subtitleDone}
        index={3}
        onClick={onSubtitleClick}
        state={subtitleDone ? "done" : "active"}
        sub={t("subtitleSub")}
        title={t("subtitle")}
      />
      <StepButton
        done={alignmentDone}
        index={4}
        onClick={onAlignmentClick}
        state={alignmentDone ? "done" : "active"}
        sub={t("alignmentSub")}
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
  sub,
  title,
}: {
  done: boolean;
  index: number;
  onClick?: () => void;
  state: "active" | "done";
  sub: string;
  title: string;
}) {
  const active = state === "active";

  return (
    <li>
      <button
        className={`grid w-full grid-cols-[28px_1fr] items-center gap-2.5 rounded-(--r) px-(--space-5) py-2.5 text-left text-[12.5px] transition-[background,color] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber) ${
          active ? "bg-(--bg-2) text-(--text)" : "text-(--text-2)"
        }`}
        disabled={!onClick}
        onClick={onClick}
        type="button"
      >
        <span
          className={`grid h-(--space-9) w-(--space-9) place-items-center rounded-(--r-pill) border font-mono text-[11px] font-semibold ${
            done ? "border-(--green) bg-(--green) text-(--bg-0)" : "border-(--text) bg-(--text) text-(--bg-0)"
          }`}
        >
          {done ? <Check aria-hidden="true" className="h-(--space-4) w-(--space-4)" /> : index}
        </span>
        <span className="min-w-0">
          {title}
          <small className="block truncate text-[10.5px] font-normal text-(--text-4)">{sub}</small>
        </span>
      </button>
    </li>
  );
}
