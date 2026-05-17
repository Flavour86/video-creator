import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, Field, NumberInput, Select } from "@/components/ui";
import type { SubtitlesSettings } from "@/lib/hooks/useProject";
import type { EditorMediaItem, EditorModal as EditorModalKind } from "./types";
import Image from "next/image";

type EditorModalProps = {
  assignRange: [number, number];
  media: EditorMediaItem[];
  modal: EditorModalKind;
  onApplySubtitles: (subtitles: SubtitlesSettings) => void;
  onClose: () => void;
  onImport: (files: FileList | null) => Promise<void> | void;
  previewResolution: "1080p" | "720p" | "9:16";
  projectPath: string;
  subtitles: SubtitlesSettings | null;
};

const SUBTITLE_PREVIEW_TEXT = "Drop an image onto a sentence and the editor knows when it should appear.";

export function EditorModal({
  assignRange,
  media,
  modal,
  onApplySubtitles,
  onClose,
  onImport,
  previewResolution,
  projectPath,
  subtitles,
}: EditorModalProps) {
  const t = useTranslations("pages.editor.modals");
  const open = modal !== null;
  const title = modal === "subtitles" ? t("subtitlesTitle") : modal === "background" ? t("backgroundTitle") : t("uploadTitle");
  const subtitle = modal === "subtitles" ? t("subtitlesSubtitle") : modal === "background" ? t("backgroundSubtitle") : t("uploadSubtitle");
  const [subtitlesDraft, setSubtitlesDraft] = useState<SubtitlesSettings>(normalizeSubtitlesSettings(subtitles));

  useEffect(() => {
    if (modal !== "subtitles") return;
    setSubtitlesDraft(normalizeSubtitlesSettings(subtitles));
  }, [modal, subtitles]);

  function onPrimaryAction() {
    if (modal === "subtitles") {
      onApplySubtitles(subtitlesDraft);
      return;
    }
    onClose();
  }

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
              <SubtitlesFields
                previewResolution={previewResolution}
                value={subtitlesDraft}
                onChange={setSubtitlesDraft}
              />
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
            <Button onClick={onPrimaryAction} variant="primary">{modal === "upload" ? t("addToProject") : t("apply")}</Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SubtitlesFields({
  onChange,
  previewResolution,
  value,
}: {
  onChange: (value: SubtitlesSettings) => void;
  previewResolution: "1080p" | "720p" | "9:16";
  value: SubtitlesSettings;
}) {
  const t = useTranslations("pages.editor.modals");
  const aspectClass = previewResolution === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const cueLines = wrapCueLine(SUBTITLE_PREVIEW_TEXT, value.style.max_chars_per_line);
  const cuePositionClass = value.style.position === "top" ? "top-4" : value.style.position === "bottom_low" ? "bottom-3" : "bottom-7";
  const cueBackgroundClass =
    value.style.bg_style === "pill"
      ? "rounded-full bg-black/60 px-4 py-2"
      : value.style.bg_style === "block"
        ? "rounded-md bg-black/80 px-4 py-2"
        : value.style.bg_style === "shadow"
          ? "drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          : "";

  return (
    <>
      <div className="grid grid-cols-2 gap-5">
        <Field htmlFor="editor-sub-bg-style" label={t("background")}>
          <Select
            id="editor-sub-bg-style"
            onChange={(event) => onChange({ ...value, style: { ...value.style, bg_style: event.target.value as SubtitlesSettings["style"]["bg_style"] } })}
            value={value.style.bg_style}
          >
            <option value="none">None</option>
            <option value="pill">Pill · 60% black</option>
            <option value="block">Block · 80% black</option>
            <option value="shadow">Drop shadow only</option>
          </Select>
        </Field>
        <Field htmlFor="editor-sub-position" label={t("position")}>
          <Select
            id="editor-sub-position"
            onChange={(event) => onChange({ ...value, style: { ...value.style, position: event.target.value as SubtitlesSettings["style"]["position"] } })}
            value={value.style.position}
          >
            <option value="bottom">Bottom · safe zone</option>
            <option value="bottom_low">Bottom · low</option>
            <option value="top">Top</option>
          </Select>
        </Field>
        <Field htmlFor="editor-sub-font" label={t("font")}>
          <Select
            id="editor-sub-font"
            onChange={(event) => onChange({ ...value, style: { ...value.style, font: event.target.value } })}
            value={value.style.font}
          >
            <option value="Arial">Arial</option>
            <option value="Sohne">Sohne</option>
            <option value="Helvetica Neue">Helvetica Neue</option>
            <option value="SF Pro">SF Pro</option>
          </Select>
        </Field>
        <Field htmlFor="editor-sub-max-chars" label={t("maxChars")}>
          <NumberInput
            id="editor-sub-max-chars"
            max={80}
            min={20}
            onChange={(event) => {
              const next = clampNumber(Number(event.target.value), 20, 80);
              onChange({ ...value, style: { ...value.style, max_chars_per_line: next } });
            }}
            value={value.style.max_chars_per_line}
          />
        </Field>
      </div>
      <Field htmlFor="editor-sub-size" label="Size">
        <div className="flex items-center gap-3">
          <input
            className="w-full"
            id="editor-sub-size"
            max={72}
            min={28}
            onChange={(event) => {
              const next = clampNumber(Number(event.target.value), 28, 72);
              onChange({ ...value, style: { ...value.style, size: next } });
            }}
            step={1}
            type="range"
            value={value.style.size}
          />
          <span className="font-mono text-[11px] text-(--text-3)">{value.style.size}px</span>
        </div>
      </Field>
      <label className="flex items-center gap-3 text-sm text-(--text-2)">
        <button
          aria-checked={value.burn_in}
          aria-label={t("burnIn")}
          className={`inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
            value.burn_in ? "border-(--blue) bg-(--blue)" : "border-(--line) bg-(--bg-3)"
          }`}
          onClick={() => onChange({ ...value, burn_in: !value.burn_in })}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition-transform ${value.burn_in ? "translate-x-5" : "translate-x-1"}`} />
        </button>
        {t("burnIn")}
      </label>
      <div className={`relative rounded-md border border-(--line) bg-(--bg-2) ${aspectClass}`} data-testid="subtitles-live-preview">
        <div
          className={`absolute inset-x-6 text-center font-semibold text-white ${cuePositionClass} ${cueBackgroundClass}`}
          style={{
            fontFamily: value.style.font,
            fontSize: `${Math.max(14, (value.style.size / 28) * 14)}px`,
            opacity: value.burn_in ? 1 : 0.5,
          }}
        >
          {cueLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
        <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white">
          Preview · {previewResolution === "9:16" ? "9:16" : "16:9"}
        </span>
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

function normalizeSubtitlesSettings(value: SubtitlesSettings | null | undefined): SubtitlesSettings {
  const fallback: SubtitlesSettings = {
    burn_in: false,
    style: {
      bg_style: "shadow",
      font: "Arial",
      max_chars_per_line: 42,
      position: "bottom",
      size: 28,
    },
  };
  if (!value) return fallback;
  return {
    burn_in: value.burn_in,
    style: {
      bg_style: value.style?.bg_style ?? fallback.style.bg_style,
      font: value.style?.font ?? fallback.style.font,
      max_chars_per_line: clampNumber(value.style?.max_chars_per_line ?? fallback.style.max_chars_per_line, 20, 80),
      position: value.style?.position ?? fallback.style.position,
      size: clampNumber(value.style?.size ?? fallback.style.size, 28, 72),
    },
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wrapCueLine(text: string, maxChars: number): string[] {
  const safeMax = clampNumber(maxChars, 20, 80);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= safeMax || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === 1 && current.length > safeMax) {
      lines.push(current.slice(0, safeMax));
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}
