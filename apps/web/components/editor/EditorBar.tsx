import { Film, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type EditorBarProps = {
  onHome: () => void;
  onRenderDraft: () => void;
  onRenderFinal: () => void;
  projectName: string;
  projectId: string;
  renderJob: EditorRenderJob;
  renderDraftDisabled: boolean;
  renderFinalDisabled: boolean;
  saveStatus: "pending" | "saving" | "saved" | "failed";
};

export function EditorBar({
  onHome,
  onRenderDraft,
  onRenderFinal,
  projectName,
  projectId,
  renderJob,
  renderDraftDisabled,
  renderFinalDisabled,
  saveStatus,
}: EditorBarProps) {
  const t = useTranslations("pages.editor");
  const autosaveLabel = saveStatus === "saving"
    ? t("saving")
    : saveStatus === "saved"
      ? t("saved")
      : "";
  const autosaveAriaLabel = autosaveLabel ? `Autosave ${autosaveLabel.toLowerCase()}` : "Autosave status";
  const renderDraftStateLabel = renderJob.running ? "queued/running" : renderDraftDisabled ? "disabled" : "ready";
  const renderFinalStateLabel = renderJob.running ? "queued/running" : renderFinalDisabled ? "disabled" : "ready";
  const draftProgress = Math.max(0, Math.min(100, Math.trunc(renderJob.progress)));
  const draftLabel = renderJob.running ? t("drafting", { progress: draftProgress }) : t("renderDraft");

  return (
    <div className="grid h-12 grid-cols-[minmax(280px,_1fr)_auto] items-center gap-[14px] border-b border-(--line) bg-(--bg-1) px-[14px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconButton icon={FolderOpen} label={t("goLauncher")} onClick={onHome} />
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-(--text)" aria-label={projectName}>
            {displayProjectName(projectName)}
          </h2>
          <p className="sr-only">projectId: {projectId.slice(0, 11)}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span
          aria-label={autosaveAriaLabel}
          aria-live="polite"
          className="inline-flex h-(--space-8) min-w-[4.75rem] items-center justify-end text-[12px] font-semibold text-(--text-2)"
        >
          {autosaveLabel}
        </span>
        <Button
          aria-label={`Render draft (${renderDraftStateLabel})`}
          disabled={renderJob.running || renderDraftDisabled}
          onClick={onRenderDraft}
          size="extra-small"
          variant="default"
        >
          {draftLabel}
        </Button>
        <Button
          aria-label={`Render final (${renderFinalStateLabel})`}
          disabled={renderJob.running || renderFinalDisabled}
          onClick={onRenderFinal}
          size="extra-small"
          variant="render"
        >
          <Film aria-hidden="true" className="h-4 w-4" />
          {t("renderFinal")}
        </Button>
      </div>
    </div>
  );
}

function displayProjectName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}
