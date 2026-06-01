import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { IconButton } from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { EditorMediaItem, EditorStateProps } from "./types";

type PreviewSurfaceProps = Pick<EditorStateProps, "currentTime" | "duration" | "layers" | "media" | "projectPath" | "sentences"> & {
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
  playbackClock?: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  resolution: string;
  subtitles: Project["subtitles"];
  watermark: Project["watermark"];
};

const FALLBACK_SUBTITLE_STYLE: NonNullable<Project["subtitles"]>["style"] = {
  bg_style: "shadow",
  font: "Arial",
  max_chars_per_line: 42,
  position: "bottom",
  size: 28,
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "m4v", "flv", "rmvb"]);
const DECODER_LOOKAHEAD_SECONDS = 3;
const DECODER_LOOKBEHIND_SECONDS = 1;
const DISPLAY_TIME_UPDATE_STEP_SECONDS = 0.1;

export function PreviewSurface({
  currentTime,
  duration,
  layers,
  media,
  onNext,
  onPrevious,
  onTogglePlay,
  playbackClock,
  playing,
  projectPath,
  resolution,
  sentences,
  subtitles,
  watermark,
}: PreviewSurfaceProps) {
  const t = useTranslations("pages.editor.transport");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const videoDecoderRefs = useRef(new Map<string, HTMLVideoElement>());
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const redrawRef = useRef<() => void>(() => {});
  const [displayTime, setDisplayTime] = useState(currentTime);
  const [subtitleLiveText, setSubtitleLiveText] = useState("");

  const portrait = resolution === "9:16";
  const canvasFrameClass = portrait ? "h-full max-w-full" : "w-full max-h-full";
  const canvasAspect = portrait ? "9 / 16" : "16 / 9";
  const subtitleStyle = subtitles?.style ?? FALLBACK_SUBTITLE_STYLE;
  const subtitlesEnabled = subtitles?.burn_in === true;
  const { height: canvasHeight, width: canvasWidth } = useMemo(() => resolutionDimensions(resolution), [resolution]);
  const watermarkSourceUrl = useMemo(() => {
    if (!watermark) return "";
    return mediaSourceUrl(projectPath, watermark.mediaId, media);
  }, [media, projectPath, watermark]);

  const activeVideoDecoderIds = useMemo(() => {
    if (!projectPath) return [];
    const ids = new Set<string>();
    const windowStart = Math.max(0, displayTime - DECODER_LOOKBEHIND_SECONDS);
    const windowEnd = displayTime + DECODER_LOOKAHEAD_SECONDS;
    for (const layer of layers) {
      if (layer.kind === "sub") continue;
      for (const item of layer.items) {
        const mediaIds = item.mediaIds && item.mediaIds.length > 0 ? item.mediaIds : item.mediaId ? [item.mediaId] : [];
        if (item.end < windowStart || item.start > windowEnd) continue;
        for (const mediaId of mediaIds) {
          if (isVideoMedia(mediaId, media)) ids.add(mediaId);
        }
      }
    }
    if (watermark && watermark.enabled !== false && isVideoMedia(watermark.mediaId, media)) {
      ids.add(watermark.mediaId);
    }
    return [...ids];
  }, [displayTime, layers, media, projectPath, watermark]);

  const registerVideoDecoder = useCallback((mediaId: string, node: HTMLVideoElement | null) => {
    if (node) {
      videoDecoderRefs.current.set(mediaId, node);
      return;
    }
    videoDecoderRefs.current.delete(mediaId);
  }, []);

  const ensureImage = useCallback((mediaId: string, primaryUrl: string, allowUploadFallback = false): HTMLImageElement => {
    const key = `${primaryUrl}|${allowUploadFallback ? "uploads" : "project"}`;
    const cached = imageCacheRef.current.get(key);
    if (cached) return cached;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => redrawRef.current();
    if (allowUploadFallback) {
      image.onerror = () => {
        const fallbackUrl = uploadMediaUrl(mediaId);
        if (image.src.endsWith(fallbackUrl)) return;
        image.src = fallbackUrl;
      };
    }
    image.src = primaryUrl;
    imageCacheRef.current.set(key, image);
    return image;
  }, []);

  const readClockTime = useCallback(() => {
    const value = playbackClock?.current?.currentTime;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return currentTime;
  }, [currentTime, playbackClock]);

  const resolveSource = useCallback((mediaId: string, clockTime: number, primaryUrl?: string, allowUploadFallback = false): HTMLImageElement | HTMLVideoElement | null => {
    if (!projectPath) return null;
    if (isVideoMedia(mediaId, media)) {
      const decoder = videoDecoderRefs.current.get(mediaId);
      if (!decoder) return null;
      syncVideoDecoder(decoder, clockTime);
      return decoder;
    }
    const image = ensureImage(mediaId, primaryUrl ?? mediaSourceUrl(projectPath, mediaId, media), allowUploadFallback);
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return null;
    }
    return image;
  }, [ensureImage, media, projectPath]);

  const drawFrame = useCallback((clockTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    const resolvedDisplay = resolveDisplay(layers, sentences, clockTime, { media });
    const backgrounds = resolvedDisplay.backgrounds.length > 0
      ? resolvedDisplay.backgrounds
      : resolvedDisplay.bg
        ? [resolvedDisplay.bg]
        : [];
    const subtitleText = resolvedDisplay.subtitle ? normalizeSubtitleText(resolvedDisplay.subtitle.text) : "";
    const subtitleVisible = subtitlesEnabled && subtitleText.length > 0;
    setSubtitleLiveText((previous) => {
      const next = subtitleVisible ? subtitleText : "";
      return previous === next ? previous : next;
    });
    const watermarkVisible = Boolean(watermark && watermark.enabled !== false);
    const drawOrder: string[] = ["black"];
    const metadata = {
      drawOrder,
      hasBackground: backgrounds.length > 0,
      hasForeground: resolvedDisplay.fg.length > 0,
      hasPip: resolvedDisplay.pip.length > 0,
      pipBoxes: [] as Array<{ height: number; mediaId: string; width: number; x: number; y: number }>,
      pipCount: resolvedDisplay.pip.length,
      playing,
      subtitlePosition: subtitleStyle.position,
      subtitleVisible,
      watermarkVisible,
    };
    const context = getCanvas2DContext(canvas);
    if (!context) {
      applyCanvasMetadata(canvas, metadata);
      return;
    }

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.save();
    context.fillStyle = "#000000";
    context.globalAlpha = 1;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.restore();

    if (backgrounds.length > 0) {
      for (const background of backgrounds) {
        const source = resolveSource(background.mediaId, background.sourceTime);
        if (source) {
          drawCover(context, source, {
            canvasHeight,
            canvasWidth,
            opacity: clamp(background.opacity, 0, 1),
          });
        }
      }
      drawOrder.push("bg");
    }

    if (resolvedDisplay.fg.length > 0) {
      for (const layer of resolvedDisplay.fg) {
        const source = resolveSource(layer.mediaId, layer.sourceTime);
        if (!source) continue;
        drawContain(context, source, {
          canvasHeight,
          canvasWidth,
          opacity: clamp(layer.opacity, 0, 1),
          translateX: layer.translateX,
        });
      }
      drawOrder.push("fg");
    }

    if (resolvedDisplay.pip.length > 0) {
      for (const layer of resolvedDisplay.pip) {
        const source = resolveSource(layer.mediaId, layer.sourceTime);
        if (!source) continue;
        const pipBox = drawPip(context, source, layer, canvasWidth, canvasHeight);
        metadata.pipBoxes.push({ mediaId: layer.mediaId, ...pipBox });
      }
      drawOrder.push("pip");
    }

    if (subtitleVisible) {
      drawSubtitle(context, subtitleText, subtitleStyle, canvasWidth, canvasHeight);
      drawOrder.push("subtitle");
    }

    if (watermarkVisible && watermark) {
      const source = resolveSource(watermark.mediaId, clockTime, watermarkSourceUrl, true);
      if (source) {
        drawWatermark(context, source, watermark, canvasWidth, canvasHeight);
      }
      drawOrder.push("watermark");
    }

    applyCanvasMetadata(canvas, metadata);
  }, [canvasHeight, canvasWidth, layers, media, playing, resolveSource, sentences, subtitleStyle, subtitlesEnabled, watermark, watermarkSourceUrl]);

  const drawAtClock = useCallback(() => {
    const time = clamp(readClockTime(), 0, Math.max(duration, 0));
    drawFrame(time);
    setDisplayTime((previous) => {
      if (Math.abs(previous - time) < DISPLAY_TIME_UPDATE_STEP_SECONDS && playing) {
        return previous;
      }
      return time;
    });
  }, [drawFrame, duration, playing, readClockTime]);

  useEffect(() => {
    redrawRef.current = drawAtClock;
  }, [drawAtClock]);

  useEffect(() => {
    drawAtClock();
  }, [drawAtClock]);

  useEffect(() => {
    if (!playing) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      drawAtClock();
      return;
    }
    const tick = () => {
      drawAtClock();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [drawAtClock, playing]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative grid h-full min-h-0 w-full place-items-center overflow-hidden rounded-(--r-md) border border-(--line) bg-black shadow-(--shadow-1)"
          data-testid="preview-stage"
        >
          <div className={`relative overflow-hidden bg-black ${canvasFrameClass}`} data-testid="preview-canvas-frame" style={{ aspectRatio: canvasAspect }}>
            <canvas
              className="absolute inset-0 h-full w-full"
              data-testid="preview-canvas"
              ref={canvasRef}
            />
          </div>
          <div aria-hidden="true" className="hidden">
            {activeVideoDecoderIds.map((mediaId) => (
              <video
                aria-hidden="true"
                data-testid="preview-video-decoder"
                key={mediaId}
                muted
                onError={(event) => {
                  const node = event.currentTarget;
                  if (node.dataset.uploadFallback === "true") return;
                  node.dataset.uploadFallback = "true";
                  node.src = uploadMediaUrl(mediaId);
                  node.load();
                }}
                playsInline
                preload="metadata"
                ref={(node) => registerVideoDecoder(mediaId, node)}
                src={watermark?.enabled !== false && watermark?.mediaId === mediaId ? watermarkSourceUrl : mediaSourceUrl(projectPath, mediaId, media)}
              />
            ))}
          </div>
        </div>
      </div>
      <p aria-live="polite" className="sr-only" data-testid="preview-subtitle-live">
        {subtitleLiveText}
      </p>
      <div className="flex items-center justify-between font-mono text-[11px] text-(--text-3)">
        <div className="flex items-center gap-2">
          <IconButton className="h-8 w-8" icon={SkipBack} label={t("prev")} onClick={onPrevious} />
          <IconButton
            className="h-8 w-8 bg-(--text) text-(--bg-0) hover:bg-(--text) hover:text-(--bg-0)"
            icon={playing ? Pause : Play}
            label={playing ? t("pause") : t("play")}
            onClick={onTogglePlay}
            variant="ghost"
          />
          <IconButton className="h-8 w-8" icon={SkipForward} label={t("next")} onClick={onNext} />
        </div>
        <div className="rounded border border-(--line) bg-(--bg-2) px-2.5 py-1 text-sm tracking-[0.02em]">
          <span className="text-(--amber)">{formatPreviewTimecode(displayTime)}</span>
          <span className="mx-2 text-(--text-3)">/</span>
          <span className="text-(--text-3)">{formatPreviewTimecode(duration)}</span>
        </div>
      </div>
    </section>
  );
}

function mediaUrl(projectPath: string, filename: string): string {
  if (!projectPath) return "";
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(filename)}`;
}

function uploadMediaUrl(filename: string): string {
  return `/api/server/uploads/media-file?filename=${encodeURIComponent(filename)}`;
}

function mediaAssetForId(mediaId: string, media: EditorMediaItem[]): EditorMediaItem | undefined {
  return media.find((item) => item.mediaId === mediaId || item.filename === mediaId);
}

function mediaSourceUrl(projectPath: string, mediaId: string, media: EditorMediaItem[]): string {
  const asset = mediaAssetForId(mediaId, media);
  if (asset?.path && isUploadPath(asset.path)) {
    return uploadMediaUrl(uploadFilenameForAsset(asset));
  }
  return mediaUrl(projectPath, asset?.filename || mediaId);
}

function isUploadPath(path: string): boolean {
  return path.replace(/\\/g, "/").startsWith("uploads/");
}

function uploadFilenameForAsset(asset: EditorMediaItem): string {
  const normalized = asset.path.replace(/\\/g, "/");
  if (normalized.startsWith("uploads/")) {
    const filename = normalized.slice("uploads/".length).split("/").filter(Boolean).at(-1);
    if (filename) return filename;
  }
  return asset.filename || asset.mediaId;
}

function formatPreviewTimecode(seconds: number): string {
  return formatTimecode(seconds, { ms: true }).replace(/^00:/, "");
}

function isVideoMedia(mediaId: string, media: EditorMediaItem[]): boolean {
  const asset = mediaAssetForId(mediaId, media);
  if (asset?.kind.includes("video")) return true;
  return [mediaId, asset?.filename, asset?.path].some((value) => typeof value === "string" && isVideoMediaId(value));
}

function isVideoMediaId(value: string): boolean {
  const extension = value.split(/[/.\\]/).at(-1)?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(extension);
}

function syncVideoDecoder(decoder: HTMLVideoElement, time: number): void {
  if (!Number.isFinite(time)) return;
  const next = Math.max(0, time);
  if (Math.abs((decoder.currentTime || 0) - next) < 0.04) {
    return;
  }
  try {
    decoder.currentTime = next;
  } catch {
    // Ignore decoder seek failures while metadata is loading.
  }
}

function resolutionDimensions(resolution: string): { height: number; width: number } {
  if (resolution === "9:16") return { width: 1080, height: 1920 };
  if (resolution === "720p") return { width: 1280, height: 720 };
  return { width: 1920, height: 1080 };
}

function sourceDimensions(
  source: HTMLImageElement | HTMLVideoElement,
  fallbackWidth: number,
  fallbackHeight: number,
): { height: number; width: number } {
  if (source instanceof HTMLVideoElement) {
    const width = source.videoWidth || fallbackWidth;
    const height = source.videoHeight || fallbackHeight;
    return { width, height };
  }
  const width = source.naturalWidth || fallbackWidth;
  const height = source.naturalHeight || fallbackHeight;
  return { width, height };
}

function drawContain(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  options: { canvasHeight: number; canvasWidth: number; opacity: number; translateX: number },
): void {
  const dimensions = sourceDimensions(source, options.canvasWidth, options.canvasHeight);
  const scale = Math.min(options.canvasWidth / dimensions.width, options.canvasHeight / dimensions.height);
  const drawWidth = dimensions.width * scale;
  const drawHeight = dimensions.height * scale;
  const x = (options.canvasWidth - drawWidth) / 2 + (options.translateX / 100) * options.canvasWidth;
  const y = (options.canvasHeight - drawHeight) / 2;
  context.save();
  context.globalAlpha = clamp(options.opacity, 0, 1);
  try {
    context.drawImage(source, x, y, drawWidth, drawHeight);
  } catch {
    // Ignore draw errors while image/video resources are still becoming drawable.
  }
  context.restore();
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  options: { canvasHeight: number; canvasWidth: number; opacity: number },
): void {
  const dimensions = sourceDimensions(source, options.canvasWidth, options.canvasHeight);
  const frameAspect = options.canvasWidth / options.canvasHeight;
  const sourceAspect = dimensions.width / dimensions.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = dimensions.width;
  let sourceHeight = dimensions.height;
  if (sourceAspect > frameAspect) {
    sourceWidth = dimensions.height * frameAspect;
    sourceX = (dimensions.width - sourceWidth) / 2;
  } else if (sourceAspect < frameAspect) {
    sourceHeight = dimensions.width / frameAspect;
    sourceY = (dimensions.height - sourceHeight) / 2;
  }
  context.save();
  context.globalAlpha = clamp(options.opacity, 0, 1);
  try {
    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      options.canvasWidth,
      options.canvasHeight,
    );
  } catch {
    // Ignore draw errors while image/video resources are still becoming drawable.
  }
  context.restore();
}

function drawPip(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  layer: { opacity: number; placement: { opacity: number; posX: number; posY: number; radius: number; size: number }; translateX: number },
  canvasWidth: number,
  canvasHeight: number,
): { height: number; width: number; x: number; y: number } {
  const placement = layer.placement;
  const width = (clamp(placement.size, 15, 60) / 100) * canvasWidth;
  const sourceSize = sourceDimensions(source, width, width * (9 / 16));
  const aspect = sourceSize.height / Math.max(sourceSize.width, 1);
  const height = width * aspect;
  const x = ((canvasWidth - width) * clamp(placement.posX, 0, 100)) / 100 + (layer.translateX / 100) * canvasWidth;
  const y = ((canvasHeight - height) * clamp(placement.posY, 0, 100)) / 100;
  const radius = Math.max(0, placement.radius);
  context.save();
  context.globalAlpha = clamp((layer.opacity * clamp(placement.opacity, 0, 100)) / 100, 0, 1);
  if (radius > 0) {
    drawRoundedRectPath(context, x, y, width, height, radius);
    context.clip();
  }
  try {
    context.drawImage(source, x, y, width, height);
  } catch {
    // Ignore draw errors while image/video resources are still becoming drawable.
  }
  context.restore();
  return { height, width, x, y };
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  watermark: NonNullable<Project["watermark"]>,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const width = clamp(watermark.scale ?? 0.08, 0.02, 0.5) * canvasWidth;
  const dimensions = sourceDimensions(source, width, width * (9 / 16));
  const height = width * (dimensions.height / Math.max(dimensions.width, 1));
  const x = ((canvasWidth - width) * clamp(watermark.posX, 0, 100)) / 100;
  const y = ((canvasHeight - height) * clamp(watermark.posY, 0, 100)) / 100;
  context.save();
  context.globalAlpha = clamp(watermark.opacity, 0, 100) / 100;
  try {
    context.drawImage(source, x, y, width, height);
  } catch {
    // Ignore draw errors while image/video resources are becoming drawable.
  }
  context.restore();
}

function drawSubtitle(
  context: CanvasRenderingContext2D,
  text: string,
  style: NonNullable<Project["subtitles"]>["style"],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const normalizedMaxChars = clamp(Math.round(style.max_chars_per_line), 12, 80);
  const fontSize = clamp(Math.round(style.size * 0.58), 16, 42);
  const lineHeight = Math.round(fontSize * 1.24);
  const maxTextWidth = canvasWidth * 0.84;
  const centerX = canvasWidth / 2;
  context.save();
  context.font = `650 ${fontSize}px ${style.font}, Inter, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = limitSubtitleLines(wrapSubtitleLines(text, context, { maxCharsPerLine: normalizedMaxChars, maxWidth: maxTextWidth }), 4);
  if (lines.length === 0) {
    context.restore();
    return;
  }
  const anchorY = style.position === "top" ? canvasHeight * 0.16 : style.position === "bottom_low" ? canvasHeight * 0.91 : canvasHeight * 0.86;
  let startY = anchorY - ((lines.length - 1) * lineHeight) / 2;
  if (style.position !== "top") {
    const minStart = canvasHeight * 0.56;
    startY = Math.max(startY, minStart);
    const bottomY = startY + (lines.length - 1) * lineHeight;
    const maxBottom = canvasHeight * 0.95;
    if (bottomY > maxBottom) {
      startY -= bottomY - maxBottom;
    }
  }
  if (style.bg_style === "pill" || style.bg_style === "block") {
    const paddingX = style.bg_style === "pill" ? 22 : 18;
    const paddingY = 10;
    const widest = lines.reduce((value, line) => Math.max(value, context.measureText(line).width), 0);
    const blockWidth = widest + paddingX * 2;
    const blockHeight = lines.length * lineHeight + paddingY * 2;
    const blockX = centerX - blockWidth / 2;
    const blockY = startY - lineHeight / 2 - paddingY;
    context.fillStyle = style.bg_style === "pill" ? "rgba(0, 0, 0, 0.60)" : "rgba(0, 0, 0, 0.80)";
    if (style.bg_style === "pill") {
      drawRoundedRectPath(context, blockX, blockY, blockWidth, blockHeight, blockHeight / 2);
      context.fill();
    } else {
      drawRoundedRectPath(context, blockX, blockY, blockWidth, blockHeight, 8);
      context.fill();
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const y = startY + index * lineHeight;
    const line = lines[index] ?? "";
    if (style.bg_style === "shadow") {
      context.shadowColor = "rgba(0, 0, 0, 0.75)";
      context.shadowBlur = Math.max(6, Math.round(fontSize * 0.25));
      context.shadowOffsetY = Math.max(2, Math.round(fontSize * 0.08));
    }
    context.strokeStyle = "rgba(0, 0, 0, 0.75)";
    context.lineWidth = Math.max(1.5, Math.round(fontSize * 0.09));
    if (typeof context.strokeText === "function") {
      context.strokeText(line, centerX, y);
    }
    context.fillStyle = "#ffffff";
    context.fillText(line, centerX, y);
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }
  context.restore();
}

function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const maxRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, maxRadius);
    return;
  }
  context.moveTo(x + maxRadius, y);
  context.lineTo(x + width - maxRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + maxRadius);
  context.lineTo(x + width, y + height - maxRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - maxRadius, y + height);
  context.lineTo(x + maxRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - maxRadius);
  context.lineTo(x, y + maxRadius);
  context.quadraticCurveTo(x, y, x + maxRadius, y);
  context.closePath();
}

function applyCanvasMetadata(
  canvas: HTMLCanvasElement,
  metadata: {
    drawOrder: string[];
    hasBackground: boolean;
    hasForeground: boolean;
    hasPip: boolean;
    pipCount: number;
    pipBoxes: Array<{ height: number; mediaId: string; width: number; x: number; y: number }>;
    playing: boolean;
    subtitlePosition: string;
    subtitleVisible: boolean;
    watermarkVisible: boolean;
  },
): void {
  canvas.dataset.drawOrder = metadata.drawOrder.join(">");
  canvas.dataset.hasBackground = metadata.hasBackground ? "true" : "false";
  canvas.dataset.hasForeground = metadata.hasForeground ? "true" : "false";
  canvas.dataset.hasPip = metadata.hasPip ? "true" : "false";
  canvas.dataset.pipBoxes = JSON.stringify(metadata.pipBoxes);
  canvas.dataset.pipCount = String(metadata.pipCount);
  canvas.dataset.subtitleVisible = metadata.subtitleVisible ? "true" : "false";
  canvas.dataset.subtitlePosition = metadata.subtitlePosition;
  canvas.dataset.watermarkVisible = metadata.watermarkVisible ? "true" : "false";
  canvas.dataset.playing = metadata.playing ? "true" : "false";
}

function getCanvas2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const shouldSilenceConsole = process.env.NODE_ENV === "test";
  const originalConsoleError = shouldSilenceConsole ? console.error : null;
  if (shouldSilenceConsole) {
    console.error = () => {};
  }
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  } finally {
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function wrapSubtitleLines(
  text: string,
  context: CanvasRenderingContext2D,
  options: { maxCharsPerLine: number; maxWidth: number },
): string[] {
  const sourceLines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const wrapped: string[] = [];
  for (const source of sourceLines) {
    wrapped.push(...wrapSubtitleLine(source, context, options));
  }
  return wrapped;
}

function limitSubtitleLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  const last = visible[maxLines - 1] ?? "";
  visible[maxLines - 1] = last.endsWith("…") ? last : `${last.replace(/[。！？.!?;；:：]+$/, "")}…`;
  return visible;
}

function wrapSubtitleLine(
  source: string,
  context: CanvasRenderingContext2D,
  options: { maxCharsPerLine: number; maxWidth: number },
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const symbol of [...source]) {
    const candidate = `${line}${symbol}`;
    const tooManyChars = visibleLength(candidate) > options.maxCharsPerLine;
    const tooWide = context.measureText(candidate).width > options.maxWidth;
    if (!tooManyChars && !tooWide) {
      line = candidate;
      continue;
    }
    if (!line) {
      lines.push(symbol.trim() || symbol);
      continue;
    }
    const breakIndex = findNaturalBreakIndex(line);
    if (breakIndex > 0) {
      const head = line.slice(0, breakIndex).trim();
      if (head) {
        lines.push(head);
      }
      line = `${line.slice(breakIndex).trim()}${symbol}`;
      continue;
    }
    lines.push(line.trim());
    line = symbol.trim() || symbol;
  }
  const tail = line.trim();
  if (tail) {
    lines.push(tail);
  }
  return lines;
}

function findNaturalBreakIndex(line: string): number {
  for (let index = line.length - 1; index > 0; index -= 1) {
    const char = line[index];
    if (!char) continue;
    if (/\s/.test(char) || /[，。！？；：、,.!?;:]/.test(char)) {
      return index + 1;
    }
  }
  return 0;
}

function visibleLength(value: string): number {
  return [...value].reduce((total, char) => total + (isWideCharacter(char) ? 2 : 1), 0);
}

function isWideCharacter(char: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFE10-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char);
}
