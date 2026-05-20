import { Film, FolderOpen, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type EditorBarProps = {
  cacheLabel: string;
  onHome: () => void;
  onRenderDraft: () => void;
  onRenderFinal: () => void;
  onSave: () => void;
  projectName: string;
  projectId: string;
  renderJob: EditorRenderJob;
  renderDisabled: boolean;
  saveStatus: "pending" | "saving" | "saved" | "failed";
  saving: boolean;
};

export function EditorBar({
  cacheLabel,
  onHome,
  onRenderDraft,
  onRenderFinal,
  onSave,
  projectName,
  projectId,
  renderJob,
  renderDisabled,
  saveStatus,
  saving,
}: EditorBarProps) {
  const t = useTranslations("pages.editor");
  const saveLabel = saveStatus === "saving" ? t("saving") : saveStatus === "saved" ? t("saved") : saveStatus === "failed" ? t("saveFailed") : t("save");
  const renderStateLabel = renderJob.running ? "queued/running" : renderDisabled ? "disabled" : "ready";
  const draftLabel = renderJob.running ? t("drafting", { progress: renderJob.progress }) : t("renderDraft");

  return (
    <div className="grid h-12 grid-cols-[minmax(280px,_1fr)_auto] items-center gap-[14px] border-b border-(--line) bg-(--bg-1) px-[14px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconButton icon={FolderOpen} label={t("goLauncher")} onClick={onHome} />
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-(--text)" aria-label={projectName}>
            {displayProjectName(projectName)}
          </h2>
          <p className="sr-only">projectId: {projectId.slice(0, 11)}</p>
          <p className="text-[11px] text-(--text-3)">{cacheLabel}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button aria-label={`Save project config (${saveStatus})`} disabled={saving} onClick={onSave} size="extra-small" variant="default">
          <Save aria-hidden="true" className="h-4 w-4" />
          {saveLabel}
        </Button>
        <Button aria-label={`Render draft (${renderStateLabel})`} disabled={renderJob.running || renderDisabled} onClick={onRenderDraft} size="extra-small" variant="default">
          {draftLabel}
        </Button>
        <Button aria-label={`Render final (${renderStateLabel})`} disabled={renderJob.running || renderDisabled} onClick={onRenderFinal} size="extra-small" variant="render">
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
