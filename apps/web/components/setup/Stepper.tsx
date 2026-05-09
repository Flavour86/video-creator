import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SetupDraft } from "@vc/shared-schemas";

type StepperProps = {
  draft: SetupDraft;
  onFolderClick?: () => void;
  onInputsClick?: () => void;
};

export function Stepper({ draft, onFolderClick, onInputsClick }: StepperProps) {
  const t = useTranslations("pages.setup.steps");
  const folderDone = Boolean(draft.path);
  const inputsDone = Boolean(draft.voice && draft.transcript);
  const alignmentDone = draft.alignment.status === "aligned";

  return (
    <ol className="sticky top-0 m-0 flex list-none flex-col gap-(--space-1) p-0">
      <StepButton done={folderDone} index={1} onClick={onFolderClick} state={folderDone ? "done" : "active"} sub={draft.path} title={t("folder")} />
      <StepButton
        done={inputsDone}
        index={2}
        onClick={onInputsClick}
        state={inputsDone ? "done" : "active"}
        sub={t("voiceTranscriptSub")}
        title={t("voiceTranscript")}
      />
      <StepButton
        done={alignmentDone}
        index={3}
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
