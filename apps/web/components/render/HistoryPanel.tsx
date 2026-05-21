import { FileVideo, Folder, Trash, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog, IconButton } from "@/components/ui";
import { formatHistoryMeta } from "@/lib/format/render";
import type { RenderHistoryEntry } from "@/lib/render/types";
import { HistorySettingsPopover } from "./HistorySettingsPopover";
import { PanelHead } from "./OutputPanel";

type HistoryPanelProps = {
  activeId: string | null;
  entries: RenderHistoryEntry[];
  onDelete: (id: string) => void;
  onPurge: () => void;
  revealEnabled: boolean;
  onReveal: (path: string) => void;
  onSelect: (id: string) => void;
};

export function HistoryPanel({ activeId, entries, onDelete, onPurge, revealEnabled, onReveal, onSelect }: HistoryPanelProps) {
  const t = useTranslations("pages.render.history");
  const [deleteTarget, setDeleteTarget] = useState<RenderHistoryEntry | null>(null);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-(--line) bg-(--bg-2)">
      <PanelHead action={<HistorySettingsPopover onPurge={onPurge} />} title={t("head")} />
      <div className="flex max-h-[300px] flex-col overflow-y-auto p-[6px]">
        {entries.length === 0 ? <p className="px-2 py-3 text-xs text-(--text-3)">{t("empty")}</p> : null}
        {entries.map((entry) => {
          const excluded = entry.status !== "done" || !entry.outputExists;
          return (
            <div
              className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-[8px] rounded-[6px] hover:bg-(--bg-3) data-[active=true]:bg-(--bg-3)"
              data-active={activeId === entry.id}
              data-err={excluded}
              key={entry.id}
            >
              <button
                className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-[10px] rounded-[6px] px-[10px] py-[9px] text-left outline-none focus-visible:ring-2 focus-visible:ring-(--amber)"
                onClick={() => onSelect(entry.id)}
                type="button"
              >
                <span className="grid h-[28px] w-[28px] place-items-center rounded-[4px] bg-(--bg-3) text-(--text-2)">
                  {excluded ? <X aria-hidden="true" size={15} /> : <FileVideo aria-hidden="true" size={15} />}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate font-mono text-[11.5px] font-medium ${excluded ? "text-(--text-3) line-through" : "text-(--text)"}`}>
                    {entry.filename}
                  </span>
                  <span className="block text-[10.5px] text-(--text-3)">
                    {formatHistoryMeta(entry)}
                  </span>
                </span>
              </button>
              <span className="pr-[6px]">
                {excluded ? (
                  <IconButton icon={Trash} label={t("delete")} onClick={() => setDeleteTarget(entry)} />
                ) : revealEnabled ? (
                  <IconButton icon={Folder} label={t("reveal")} onClick={() => onReveal(entry.outputPath)} />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        body={<><span className="font-mono">{deleteTarget?.filename}</span> {t("deleteBody")}</>}
        cancelLabel={t("cancel")}
        confirmLabel={t("delete")}
        destructive
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget.id); }}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        open={Boolean(deleteTarget)}
        title={t("deleteTitle")}
      />
    </section>
  );
}
