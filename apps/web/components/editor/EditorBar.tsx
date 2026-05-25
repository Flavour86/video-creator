import { Film, FolderOpen, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type EditorBarProps = {
  onHome: () => void;
  onRenderDraft: () => void;
  onRenderFinal: () => void;
  onSave: () => void;
  projectName: string;
  projectId: string;
  renderJob: EditorRenderJob;
  renderDraftDisabled: boolean;
  renderFinalDisabled: boolean;
  saveStatus: "pending" | "saving" | "saved" | "failed";
  saving: boolean;
};

export function EditorBar({
  onHome,
  onRenderDraft,
  onRenderFinal,
  onSave,
  projectName,
  projectId,
  renderJob,
  renderDraftDisabled,
  renderFinalDisabled,
  saveStatus,
  saving,
}: EditorBarProps) {
  const t = useTranslations("pages.editor");
  const saveLabel = saveStatus === "pending"
    ? t("pending")
    : saveStatus === "saving"
      ? t("saving")
      : saveStatus === "saved"
        ? t("saved")
        : saveStatus === "failed"
          ? t("saveFailed")
          : t("save");
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
        <Button aria-label={`Save project config (${saveStatus})`} disabled={saving} onClick={onSave} size="extra-small" variant="default">
          <Save aria-hidden="true" className="h-4 w-4" />
          {saveLabel}
        </Button>
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
