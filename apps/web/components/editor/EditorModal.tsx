import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Field, NumberInput, Select } from "@/components/ui";
import type { SubtitlesSettings } from "@/lib/hooks/useProject";
import type { EditorMediaItem, EditorModal as EditorModalKind } from "./types";

type EditorModalProps = {
  assignRange: [number, number];
  media: EditorMediaItem[];
  modal: EditorModalKind;
  onApplySubtitles: (subtitles: SubtitlesSettings) => void;
  onClose: () => void;
  onImport: (files: FileList | null) => Promise<unknown> | unknown;
  previewResolution: "1080p" | "720p" | "9:16";
  projectPath: string;
  subtitles: SubtitlesSettings | null;
};

const SUBTITLE_PREVIEW_TEXT = "This subtitle preview follows your style and stays inside the safe zone.";
const SUBTITLE_SIDE_SAFE_RATIO = 0.08;
const SUBTITLE_POSITION_MARGINS: Record<SubtitlesSettings["style"]["position"], number> = {
  bottom: 60,
  bottom_low: 24,
  top: 40,
};

type PreviewResolution = EditorModalProps["previewResolution"];

type SubtitlePreviewMetrics = {
  aspectClass: string;
  frameWidth: number;
  maxHeight: string;
  renderHeight: number;
  renderWidth: number;
  width: string;
};

const SUBTITLE_PREVIEW_METRICS: Record<PreviewResolution, SubtitlePreviewMetrics> = {
  "1080p": {
    aspectClass: "aspect-video",
    frameWidth: 720,
    maxHeight: "min(58vh, 520px)",
    renderHeight: 1080,
    renderWidth: 1920,
    width: "100%",
  },
  "720p": {
    aspectClass: "aspect-video",
    frameWidth: 720,
    maxHeight: "min(58vh, 520px)",
    renderHeight: 720,
    renderWidth: 1280,
    width: "100%",
  },
  "9:16": {
    aspectClass: "aspect-[9/16]",
    frameWidth: 292.5,
    maxHeight: "min(58vh, 520px)",
    renderHeight: 1920,
    renderWidth: 1080,
    width: "min(100%, calc(min(58vh, 520px) * 9 / 16))",
  },
};

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
  const compactSubtitles = modal === "subtitles";
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
        <Dialog.Content className={`fixed left-1/2 z-50 flex max-h-[90vh] -translate-x-1/2 flex-col border border-(--line) bg-(--bg-1) shadow-(--shadow-2) ${compactSubtitles ? "top-1/2 w-[min(760px,calc(100vw-32px))] -translate-y-1/2 rounded-(--r-lg)" : "top-0 my-[5vh] w-[min(900px,calc(100vw-32px))] rounded-lg"}`}>
          <header className={`flex items-start justify-between gap-4 border-b border-(--line) ${compactSubtitles ? "px-5 py-[15px]" : "px-6 py-4"}`}>
            <div>
              <Dialog.Title className={`${compactSubtitles ? "text-base" : "text-xl"} font-semibold tracking-normal text-(--text)`}>{title}</Dialog.Title>
              <Dialog.Description className={`mt-1 ${compactSubtitles ? "text-xs" : "text-sm"} text-(--text-3)`}>{subtitle}</Dialog.Description>
            </div>
            <button aria-label={t("close")} onClick={onClose} type="button"><X className="h-5 w-5" /></button>
          </header>
          <div className={`flex flex-col overflow-y-auto ${compactSubtitles ? "gap-4 px-5 py-4" : "gap-5 px-6 py-5"}`}>
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
          <footer className={`flex items-center justify-end gap-2 border-t border-(--line) ${compactSubtitles ? "bg-(--bg-2) px-5 py-[14px]" : "px-6 py-4"}`}>
            <Button onClick={onClose} variant="ghost">{t("cancel")}</Button>
            <Button onClick={onPrimaryAction} variant={compactSubtitles ? "render" : "primary"}>{modal === "upload" ? t("addToProject") : t("apply")}</Button>
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
  const previewRef = useRef<HTMLDivElement | null>(null);
  const metrics = SUBTITLE_PREVIEW_METRICS[previewResolution];
  const [measuredFrameWidth, setMeasuredFrameWidth] = useState<number | null>(null);
  const cueLines = wrapCueLine(SUBTITLE_PREVIEW_TEXT, value.style.max_chars_per_line);
  const frameWidth = measuredFrameWidth ?? metrics.frameWidth;
  const previewScale = frameWidth / metrics.renderWidth;
  const cueStyle = subtitlePreviewCueStyle(value, previewScale, metrics);

  useEffect(() => {
    setMeasuredFrameWidth(null);
    const node = previewRef.current;
    if (!node) return;

    const updateFrameWidth = () => {
      const width = node.getBoundingClientRect().width || node.clientWidth;
      setMeasuredFrameWidth(width > 0 ? width : null);
    };

    updateFrameWidth();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateFrameWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [previewResolution]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
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
            className="h-2 w-full accent-(--amber)"
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
            value.burn_in ? "border-(--amber) bg-(--amber)" : "border-(--line) bg-(--bg-3)"
          }`}
          onClick={() => onChange({ ...value, burn_in: !value.burn_in })}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full transition-transform ${value.burn_in ? "translate-x-5 bg-(--bg-0)" : "translate-x-1 bg-white"}`} />
        </button>
        {t("burnIn")}
      </label>
      <div className="w-full">
        <div
          className={`relative mx-auto overflow-hidden rounded-md border border-(--line) bg-(--bg-2) ${metrics.aspectClass}`}
          data-preview-scale={previewScale}
          data-preview-width={frameWidth}
          data-render-height={metrics.renderHeight}
          data-render-width={metrics.renderWidth}
          data-testid="subtitles-live-preview"
          ref={previewRef}
          style={{
            aspectRatio: `${metrics.renderWidth} / ${metrics.renderHeight}`,
            maxHeight: metrics.maxHeight,
            width: metrics.width,
          }}
        >
        {value.burn_in ? (
          <div
            className="absolute text-center font-semibold text-white"
            data-testid="subtitles-preview-cue"
            style={cueStyle}
          >
            {cueLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}
          <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white">
          Preview · {previewResolution === "9:16" ? "9:16" : "16:9"}
          </span>
        </div>
      </div>
    </>
  );
}

function subtitlePreviewCueStyle(
  value: SubtitlesSettings,
  previewScale: number,
  metrics: SubtitlePreviewMetrics,
): CSSProperties {
  const positionMargin = SUBTITLE_POSITION_MARGINS[value.style.position] * previewScale;
  const sideSafe = metrics.renderWidth * SUBTITLE_SIDE_SAFE_RATIO * previewScale;
  const backgroundStyle = subtitlePreviewBackgroundStyle(value.style.bg_style, previewScale);
  const positionStyle = value.style.position === "top" ? { top: positionMargin } : { bottom: positionMargin };

  return {
    ...positionStyle,
    ...backgroundStyle,
    fontFamily: value.style.font,
    fontSize: value.style.size * previewScale,
    left: "50%",
    lineHeight: 1.24,
    maxWidth: `calc(100% - ${sideSafe * 2}px)`,
    transform: "translateX(-50%)",
    width: `calc(100% - ${sideSafe * 2}px)`,
  };
}

function subtitlePreviewBackgroundStyle(
  bgStyle: SubtitlesSettings["style"]["bg_style"],
  previewScale: number,
): CSSProperties {
  if (bgStyle === "pill") {
    return {
      backgroundColor: "rgb(0 0 0 / 0.6)",
      borderRadius: 9999,
      padding: `${10 * previewScale}px ${22 * previewScale}px`,
    };
  }
  if (bgStyle === "block") {
    return {
      backgroundColor: "rgb(0 0 0 / 0.8)",
      borderRadius: 8 * previewScale,
      padding: `${10 * previewScale}px ${18 * previewScale}px`,
    };
  }
  if (bgStyle === "shadow") {
    return {
      filter: `drop-shadow(0 ${2 * previewScale}px ${8 * previewScale}px rgb(0 0 0 / 0.9))`,
    };
  }
  return {};
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
  onImport: (files: FileList | null) => Promise<unknown> | unknown;
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
          {media.map((item) => {
            const src = mediaSrc(projectPath, item);
            return (
              <button
                aria-label={`Select ${item.filename}`}
                className="rounded-md border border-(--line) bg-(--bg-2) p-2 text-left hover:border-(--bg-5)"
                disabled={item.importing}
                key={item.filename}
                type="button"
              >
                {src ? (
                  <img
                    alt={item.filename}
                    className="aspect-video w-full rounded-sm bg-(--bg-3) object-cover"
                    src={src}
                  />
                ) : (
                  <div aria-hidden="true" className="aspect-video w-full rounded-sm bg-(--bg-3)" />
                )}
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
            );
          })}
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

function mediaSrc(projectPath: string, item: EditorMediaItem): string | null {
  if (item.thumb_url) return `/api/server${item.thumb_url}`;
  if (item.path.startsWith("uploads/")) {
    return `/api/server/uploads/media-file?filename=${encodeURIComponent(item.mediaId)}`;
  }
  if (!projectPath) return null;
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
