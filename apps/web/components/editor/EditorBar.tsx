import { Clapperboard, Film, FolderOpen, Image as ImageIcon, Save, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton, StatusTag } from "@/components/ui";
import type { EditorRenderJob } from "./types";

type EditorBarProps = {
  cacheLabel: string;
  onChangeBackground: () => void;
  onOpenFolder: () => void;
  onRenderDraft: () => void;
  onRenderFinal: () => void;
  onSave: () => void;
  onSubtitles: () => void;
  projectName: string;
  projectPath: string;
  renderJob: EditorRenderJob;
  renderDisabled: boolean;
  saveStatus: "pending" | "saving" | "saved" | "failed";
  saving: boolean;
};

export function EditorBar({
  cacheLabel,
  onChangeBackground,
  onOpenFolder,
  onRenderDraft,
  onRenderFinal,
  onSave,
  onSubtitles,
  projectName,
  projectPath,
  renderJob,
  renderDisabled,
  saveStatus,
  saving,
}: EditorBarProps) {
  const t = useTranslations("pages.editor");
  const saveLabel = saveStatus === "saving" ? t("saving") : saveStatus === "saved" ? t("saved") : saveStatus === "failed" ? t("saveFailed") : t("save");

  return (
    <div className="grid h-12 grid-cols-[minmax(280px,_22%)_1fr_minmax(360px,_28%)] items-center gap-[14px] border-b border-(--line) bg-(--bg-1) px-[14px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconButton icon={FolderOpen} label={t("openFolder")} onClick={onOpenFolder} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-normal text-(--text)">{projectName}</h2>
          <p className="truncate font-mono text-[11px] text-(--text-3)">{projectPath}</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={onSubtitles} size="extra-small" variant="ghost">
          <Type aria-hidden="true" className="h-4 w-4" />
          {t("subtitles")}
        </Button>
        <Button aria-label={t("changeBgAria")} onClick={onChangeBackground} size="extra-small" variant="ghost">
          <ImageIcon aria-hidden="true" className="h-4 w-4" />
          {t("changeBg")}
        </Button>
      </div>
      <div className="flex items-center justify-end gap-2">
        <StatusTag title={`${projectPath}\\.vc\\clips`} variant="ready">{cacheLabel}</StatusTag>
        <Button disabled={saving} onClick={onSave} size="extra-small" variant="ghost">
          <Save aria-hidden="true" className="h-4 w-4" />
          {saveLabel}
        </Button>
        <Button disabled={renderJob.running || renderDisabled} onClick={onRenderDraft} size="extra-small" variant="ghost">
          <Clapperboard aria-hidden="true" className="h-4 w-4" />
          {renderJob.running ? t("drafting", { progress: renderJob.progress }) : t("renderDraft")}
        </Button>
        <Button disabled={renderJob.running || renderDisabled} onClick={onRenderFinal} size="extra-small" variant="render">
          <Film aria-hidden="true" className="h-4 w-4" />
          {t("renderFinal")}
        </Button>
      </div>
    </div>
  );
}
