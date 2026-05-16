import { Clapperboard, Film, Home, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton, StatusTag } from "@/components/ui";
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
        <IconButton icon={Home} label={t("goLauncher")} onClick={onHome} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-normal text-(--text)">{projectName}</h2>
          <p className="truncate font-mono text-[11px] text-(--text-3)">projectId: {projectId.slice(0, 11)}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <StatusTag aria-label={`Render cache status: ${cacheLabel}`} title={cacheLabel} variant="ready">{cacheLabel}</StatusTag>
        <Button aria-label={`Save project config (${saveStatus})`} disabled={saving} onClick={onSave} size="extra-small" variant="ghost">
          <Save aria-hidden="true" className="h-4 w-4" />
          {saveLabel}
        </Button>
        <Button aria-label={`Render draft (${renderStateLabel})`} disabled={renderJob.running || renderDisabled} onClick={onRenderDraft} size="extra-small" variant="ghost">
          <Clapperboard aria-hidden="true" className="h-4 w-4" />
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
