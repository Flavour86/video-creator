import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Button, Checkbox, Field, NumberInput, Select } from "@/components/ui";
import type { EditorMediaItem, EditorModal as EditorModalKind } from "./types";
import Image from "next/image";

type EditorModalProps = {
  assignRange: [number, number];
  media: EditorMediaItem[];
  modal: EditorModalKind;
  onClose: () => void;
  onImport: (files: FileList | null) => Promise<void> | void;
  projectPath: string;
};

export function EditorModal({ assignRange, media, modal, onClose, onImport, projectPath }: EditorModalProps) {
  const t = useTranslations("pages.editor.modals");
  const open = modal !== null;
  const title = modal === "subtitles" ? t("subtitlesTitle") : modal === "background" ? t("backgroundTitle") : t("uploadTitle");
  const subtitle = modal === "subtitles" ? t("subtitlesSubtitle") : modal === "background" ? t("backgroundSubtitle") : t("uploadSubtitle");

  return (
    <Dialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-(--bg-0)/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-0 z-50 my-[5vh] flex max-h-[90vh] w-[min(900px,calc(100vw-32px))] -translate-x-1/2 flex-col rounded-lg border border-(--line) bg-(--bg-1) shadow-(--shadow-2)">
          <header className="flex items-start justify-between gap-4 border-b border-(--line) px-6 py-4">
            <div>
              <Dialog.Title className="text-xl font-semibold tracking-normal text-(--text)">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-(--text-3)">{subtitle}</Dialog.Description>
            </div>
            <button aria-label={t("close")} onClick={onClose} type="button"><X className="h-5 w-5" /></button>
          </header>
          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
            {modal === "subtitles" ? (
              <SubtitlesFields />
            ) : (
              <MediaFields
                assignRange={assignRange}
                media={media}
                onImport={onImport}
                projectPath={projectPath}
                upload={modal === "upload"}
              />
            )}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-(--line) px-6 py-4">
            <Button onClick={onClose} variant="ghost">{t("cancel")}</Button>
            <Button onClick={onClose} variant="primary">{modal === "upload" ? t("addToProject") : t("apply")}</Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SubtitlesFields() {
  const t = useTranslations("pages.editor.modals");
  return (
    <>
      <div className="grid grid-cols-2 gap-5">
        <Field label={t("background")}><Select defaultValue="shadow"><option>None</option><option>Pill · 60% black</option><option>Block · 80% black</option><option value="shadow">Drop shadow only</option></Select></Field>
        <Field label={t("position")}><Select defaultValue="bottom"><option value="bottom">Bottom · safe zone</option><option>Bottom · low</option><option>Top</option></Select></Field>
        <Field label={t("font")}><Select defaultValue="Inter"><option>Inter</option><option>Sohne</option><option>Helvetica Neue</option><option>SF Pro</option></Select></Field>
        <Field label={t("maxChars")}><NumberInput defaultValue={42} max={120} min={20} /></Field>
      </div>
      <label className="flex items-center gap-3 text-sm text-(--text-2)"><Checkbox defaultChecked />{t("burnIn")}</label>
      <div className="aspect-video rounded-md border border-(--line) bg-(--bg-2) p-8 text-center text-lg font-semibold text-white shadow-(--shadow-1)">
        {t("previewText")}
      </div>
    </>
  );
}

function MediaFields({
  assignRange,
  media,
  onImport,
  projectPath,
  upload,
}: {
  assignRange: [number, number];
  media: EditorMediaItem[];
  onImport: (files: FileList | null) => Promise<void> | void;
  projectPath: string;
  upload: boolean;
}) {
  const t = useTranslations("pages.editor.modals");
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <Field label={t("asset")}>
        <div className="mb-3">
          <Button onClick={() => inputRef.current?.click()} type="button" variant="ghost">
            Import from disk...
          </Button>
          <input
            className="hidden"
            multiple
            onChange={(event) => {
              void onImport(event.target.files);
              event.currentTarget.value = "";
            }}
            ref={inputRef}
            type="file"
          />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {media.map((item) => (
            <button
              aria-label={`Select ${item.filename}`}
              className="rounded-md border border-(--line) bg-(--bg-2) p-2 text-left hover:border-(--bg-5)"
              disabled={item.importing}
              key={item.filename}
              type="button"
            >
              <Image alt={item.filename} className="aspect-video w-full rounded-sm bg-(--bg-3) object-cover" src={mediaSrc(projectPath, item)} />
              <div className="mt-2 truncate font-mono text-[11px] text-(--text-2)">{item.filename}</div>
              <div className="truncate font-mono text-[10px] text-(--text-3)">
                {formatKindBadge(item)} · {formatBytes(item.size)}
              </div>
              <div className="truncate font-mono text-[10px] text-(--text-3)">{formatMeta(item)}</div>
              {item.importing ? (
                <div className="truncate font-mono text-[10px] text-(--blue)">Importing {Math.max(0, Math.min(100, Math.round(item.import_progress ?? 0)))}%</div>
              ) : null}
              {item.import_error ? <div className="truncate font-mono text-[10px] text-(--red)">Import failed: {item.import_error}</div> : null}
            </button>
          ))}
        </div>
      </Field>
      {upload ? (
        <div className="grid grid-cols-2 gap-5">
          <Field htmlFor="editor-assign-from" label={t("from")}><NumberInput defaultValue={assignRange[0]} id="editor-assign-from" min={1} /></Field>
          <Field htmlFor="editor-assign-to" label={t("to")}><NumberInput defaultValue={assignRange[1]} id="editor-assign-to" min={assignRange[0]} /></Field>
          <Field label={t("compositing")}><Select defaultValue="fullscreen"><option value="fullscreen">Fullscreen</option><option>Picture-in-picture</option></Select></Field>
          <Field label={t("motion")}><Select defaultValue="none"><option value="none">None - static</option><option>Zoom in</option><option>Pan left</option></Select></Field>
        </div>
      ) : null}
    </>
  );
}

function mediaSrc(projectPath: string, item: EditorMediaItem): string {
  if (item.thumb_url) return `/api/server${item.thumb_url}`;
  if (item.path.startsWith("uploads/")) {
    return `/api/server/uploads/media-file?filename=${encodeURIComponent(item.mediaId)}`;
  }
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.filename)}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatKindBadge(item: EditorMediaItem): string {
  const ext = fileExt(item.filename);
  if (item.kind === "image") return "IMG";
  if (item.kind === "video") {
    if (ext === "mp4" || ext === "mov" || ext === "rmvb" || ext === "flv") return ext.toUpperCase();
    return "VIDEO";
  }
  if (item.kind === "audio") return ext ? ext.toUpperCase() : "AUDIO";
  return item.kind.toUpperCase();
}

function formatMeta(item: EditorMediaItem): string {
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : null;
  const duration = typeof item.duration === "number" && item.duration > 0 ? `${item.duration.toFixed(1)}s` : null;
  return [dimensions, duration].filter(Boolean).join(" · ") || "No media metadata";
}

function fileExt(filename: string): string {
  const name = filename.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1);
}
