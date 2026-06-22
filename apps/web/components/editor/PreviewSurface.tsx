import { Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { IconButton } from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import { backgroundMediaIdsForItem } from "@/lib/preview/backgroundSchedule";
import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence, AlignedWord } from "@/lib/hooks/useAlignment";
import type { EditorMediaItem, EditorStateProps } from "./types";

type PreviewSurfaceProps = Pick<EditorStateProps, "currentTime" | "duration" | "layers" | "media" | "projectPath" | "sentences"> & {
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
  playbackClock?: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  resolution: string;
  subtitles: Project["subtitles"];
  subtitleTextOverrides?: boolean;
  watermark: Project["watermark"];
  words?: AlignedWord[];
};

type SubtitleStyle = Omit<NonNullable<Project["subtitles"]>["style"], "bg_color" | "bg_opacity" | "bg_radius" | "color"> & {
  bg_color: string;
  bg_opacity: number;
  bg_radius: number;
  color: string;
};

const FALLBACK_SUBTITLE_STYLE: SubtitleStyle = {
  bg_style: "shadow",
  color: "#ffffff",
  bg_color: "#000000",
  bg_opacity: 62,
  bg_radius: 8,
  font: "Arial",
  max_chars_per_line: 42,
  position: "bottom",
  size: 28,
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "m4v", "flv", "rmvb"]);
const DECODER_LOOKAHEAD_SECONDS = 3;
const DECODER_LOOKBEHIND_SECONDS = 1;
const DISPLAY_TIME_UPDATE_STEP_SECONDS = 0.1;
const SUBTITLE_MAX_CUE_LINES = 2;
const SUBTITLE_MAX_CUE_SECONDS = 7.0;
const SUBTITLE_MIN_CUE_SECONDS = 0.2;
const SENTENCE_PUNCTUATION = [".", "!", "?", "\u3002", "\uff01", "\uff1f"];
const CLAUSE_PUNCTUATION = [",", ";", ":", "\uff0c", "\uff1b", "\uff1a", "\u3001"];
const BREAK_PUNCTUATION = [...SENTENCE_PUNCTUATION, ...CLAUSE_PUNCTUATION];
const CLOSING_PUNCTUATION = ".,!?;:\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u3001)]}\u3011\u300b";
const OPENING_PUNCTUATION = "([{\u3010\u300a";

type ManifestBox = { height: number; width: number; x: number; y: number };
type SubtitleLayout = {
  bbox: ManifestBox;
  fontSize: number;
  lineHeight: number;
  lines: string[];
  maxCharsPerLine: number;
};
type PreviewRenderManifestLayer = {
  bbox?: ManifestBox;
  itemId?: string;
  kind: "black" | "bg" | "fg" | "pip" | "subtitle" | "watermark";
  layerId?: string;
  lines?: string[];
  mediaId?: string;
  opacity?: number;
  sourceTime?: number;
  style?: Record<string, unknown>;
  text?: string;
  transition?: Record<string, unknown>;
};
type PreviewRenderManifest = {
  activeMediaIds: string[];
  drawOrder: string[];
  frame: { height: number; width: number };
  layers: PreviewRenderManifestLayer[];
  resolution: string;
  timestamp: number;
  version: 1;
};
type SubtitleCue = {
  preserveEnd: boolean;
  words: AlignedWord[];
};
type SubtitleCueSpan = {
  end_s: number;
  lines: string[];
  start_s: number;
  text: string;
};
type SubtitleSentenceWords = {
  splitLongWordDuration: boolean;
  words: AlignedWord[];
};

declare global {
  interface Window {
    __VC_PREVIEW_RENDER_MANIFEST__?: PreviewRenderManifest;
  }
}

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
  subtitleTextOverrides = false,
  watermark,
  words = [],
}: PreviewSurfaceProps) {
  const t = useTranslations("pages.editor.transport");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const videoDecoderRefs = useRef(new Map<string, HTMLVideoElement>());
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const redrawRef = useRef<() => void>(() => {});
  const [displayTime, setDisplayTime] = useState(currentTime);
  const [subtitleLiveText, setSubtitleLiveText] = useState("");

  const portrait = resolution === "9:16";
  const canvasFrameClass = portrait ? "h-full max-w-full" : "w-full max-h-full";
  const canvasAspect = portrait ? "9 / 16" : "16 / 9";
  const subtitleStyle = useMemo(() => normalizeSubtitleStyle(subtitles?.style), [subtitles?.style]);
  const subtitlesEnabled = subtitles?.burn_in === true;
  const subtitleCues = useMemo(
    () => buildSubtitleCueSpans(sentences, words, subtitleStyle.max_chars_per_line, subtitleTextOverrides),
    [sentences, subtitleStyle.max_chars_per_line, subtitleTextOverrides, words],
  );
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
        const mediaIds = layer.kind === "bg"
          ? backgroundMediaIdsForItem(item)
          : item.mediaIds && item.mediaIds.length > 0
            ? item.mediaIds
            : item.mediaId
              ? [item.mediaId]
              : [];
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
      const targetTime = Number.parseFloat(decoder.dataset.vcTargetTime ?? "");
      if (
        decoder.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || decoder.videoWidth <= 0
        || decoder.videoHeight <= 0
        || decoder.seeking
        || decoder.dataset.vcSeekReady !== "true"
        || !Number.isFinite(targetTime)
        || Math.abs(targetTime - Math.max(0, clockTime)) > 0.04
        || Math.abs((decoder.currentTime || 0) - Math.max(0, clockTime)) > 0.08
      ) {
        return null;
      }
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
    const activeSubtitle = activeSubtitleCue(subtitleCues, clockTime);
    const subtitleText = activeSubtitle ? normalizeSubtitleText(activeSubtitle.text) : "";
    const subtitleVisible = subtitlesEnabled && subtitleText.length > 0;
    setSubtitleLiveText((previous) => {
      const next = subtitleVisible ? subtitleText : "";
      return previous === next ? previous : next;
    });
    const watermarkVisible = Boolean(watermark && watermark.enabled !== false);
    const drawOrder: string[] = ["black"];
    const manifest: PreviewRenderManifest = {
      activeMediaIds: [],
      drawOrder,
      frame: { height: canvasHeight, width: canvasWidth },
      layers: [{
        bbox: fullFrameBox(canvasWidth, canvasHeight),
        kind: "black",
        opacity: 1,
      }],
      resolution,
      timestamp: roundManifestNumber(clockTime),
      version: 1,
    };
    const metadata = {
      activeBackgrounds: backgrounds.map((background) => background.mediaId),
      drawOrder,
      hasBackground: backgrounds.length > 0,
      hasForeground: resolvedDisplay.fg.length > 0,
      hasPip: resolvedDisplay.pip.length > 0,
      pipBoxes: [] as Array<{ height: number; mediaId: string; width: number; x: number; y: number }>,
      pipCount: resolvedDisplay.pip.length,
      playing,
      renderManifest: manifest,
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
            motionKind: background.motion.kind,
            motionProgress: background.motionProgress,
            opacity: clamp(background.opacity, 0, 1),
          });
          manifest.layers.push({
            bbox: fullFrameBox(canvasWidth, canvasHeight),
            itemId: background.itemId,
            kind: "bg",
            layerId: background.layerId,
            mediaId: background.mediaId,
            opacity: roundManifestNumber(background.opacity),
            sourceTime: roundManifestNumber(background.sourceTime),
            transition: manifestTransition(background.transition),
          });
        }
      }
      drawOrder.push("bg");
    }

    if (resolvedDisplay.fg.length > 0) {
      for (const layer of resolvedDisplay.fg) {
        const source = resolveSource(layer.mediaId, layer.sourceTime);
        if (!source) continue;
        drawCover(context, source, {
          canvasHeight,
          canvasWidth,
          motionKind: layer.motion.kind,
          motionProgress: layer.motionProgress,
          opacity: clamp(layer.opacity, 0, 1),
          translateX: layer.translateX,
        });
        manifest.layers.push({
          bbox: fullFrameBox(canvasWidth, canvasHeight),
          itemId: layer.itemId,
          kind: "fg",
          layerId: layer.layerId,
          mediaId: layer.mediaId,
          opacity: roundManifestNumber(layer.opacity),
          sourceTime: roundManifestNumber(layer.sourceTime),
          transition: manifestTransition(layer.transition, layer.translateX),
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
        manifest.layers.push({
          bbox: roundManifestBox(pipBox),
          itemId: layer.itemId,
          kind: "pip",
          layerId: layer.layerId,
          mediaId: layer.mediaId,
          opacity: roundManifestNumber(layer.opacity * (layer.placement.opacity / 100)),
          sourceTime: roundManifestNumber(layer.sourceTime),
          transition: manifestTransition(layer.transition, layer.translateX),
        });
      }
      drawOrder.push("pip");
    }

    if (subtitleVisible) {
      const subtitleLayout = drawSubtitle(context, subtitleText, subtitleStyle, canvasWidth, canvasHeight, activeSubtitle?.lines);
      if (subtitleLayout) {
        manifest.layers.push({
          bbox: roundManifestBox(subtitleLayout.bbox),
          kind: "subtitle",
          lines: subtitleLayout.lines,
          opacity: 1,
          style: subtitleManifestStyle(subtitleStyle, subtitleLayout),
          text: subtitleText,
        });
        drawOrder.push("subtitle");
      }
    }

    if (watermarkVisible && watermark) {
      const source = resolveSource(watermark.mediaId, clockTime, watermarkSourceUrl, true);
      if (source) {
        const watermarkBox = drawWatermark(context, source, watermark, canvasWidth, canvasHeight);
        manifest.layers.push({
          bbox: roundManifestBox(watermarkBox),
          kind: "watermark",
          mediaId: watermark.mediaId,
          opacity: roundManifestNumber(watermark.opacity / 100),
          sourceTime: roundManifestNumber(clockTime),
          style: {
            posX: watermark.posX,
            posY: watermark.posY,
            scale: watermark.scale,
          },
        });
      }
      drawOrder.push("watermark");
    }

    manifest.activeMediaIds = manifest.layers
      .map((layer) => layer.mediaId)
      .filter((mediaId): mediaId is string => Boolean(mediaId));
    applyCanvasMetadata(canvas, metadata);
  }, [canvasHeight, canvasWidth, layers, media, playing, resolution, resolveSource, sentences, subtitleCues, subtitleStyle, subtitlesEnabled, watermark, watermarkSourceUrl]);

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

  const handleToggleFullscreen = useCallback(() => {
    const target = previewStageRef.current;
    if (!target) return;

    if (document.fullscreenElement === target) {
      if (typeof document.exitFullscreen !== "function") return;
      try {
        void document.exitFullscreen().catch(() => {});
      } catch {
        // Fullscreen failures are browser UI state only.
      }
      return;
    }

    if (typeof target.requestFullscreen !== "function") return;
    try {
      void target.requestFullscreen().catch(() => {});
    } catch {
      // Fullscreen failures are browser UI state only.
    }
  }, []);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative grid h-full min-h-0 w-full place-items-center overflow-hidden rounded-(--r-md) border border-(--line) bg-black shadow-(--shadow-1)"
          data-testid="preview-stage"
          ref={previewStageRef}
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
                onCanPlay={(event) => {
                  markVideoDecoderReady(event.currentTarget);
                  redrawRef.current();
                }}
                onLoadedData={(event) => {
                  markVideoDecoderReady(event.currentTarget);
                  redrawRef.current();
                }}
                onLoadedMetadata={() => redrawRef.current()}
                onSeeked={(event) => {
                  event.currentTarget.dataset.vcSeekReady = "true";
                  redrawRef.current();
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
        <div className="flex items-center gap-2">
          <IconButton className="h-8 w-8" icon={Maximize2} label={t("fullscreen")} onClick={handleToggleFullscreen} />
          <div className="rounded border border-(--line) bg-(--bg-2) px-2.5 py-1 text-sm tracking-[0.02em]">
            <span className="text-(--amber)">{formatPreviewTimecode(displayTime)}</span>
            <span className="mx-2 text-(--text-3)">/</span>
            <span className="text-(--text-3)">{formatPreviewTimecode(duration)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function normalizeSubtitleStyle(style: NonNullable<Project["subtitles"]>["style"] | null | undefined): SubtitleStyle {
  const normalized = { ...FALLBACK_SUBTITLE_STYLE, ...(style ?? {}) };
  return {
    ...normalized,
    bg_color: normalized.bg_color ?? FALLBACK_SUBTITLE_STYLE.bg_color,
    bg_opacity: normalized.bg_opacity ?? FALLBACK_SUBTITLE_STYLE.bg_opacity,
    bg_radius: normalized.bg_radius ?? FALLBACK_SUBTITLE_STYLE.bg_radius,
    color: normalized.color ?? FALLBACK_SUBTITLE_STYLE.color,
  };
}

function fullFrameBox(width: number, height: number): ManifestBox {
  return { height, width, x: 0, y: 0 };
}

function manifestTransition(
  transition: { duration: number; kind: string; phase: string; progress: number },
  translateX = 0,
): Record<string, unknown> {
  return {
    duration: roundManifestNumber(transition.duration),
    kind: transition.kind,
    phase: transition.phase,
    progress: roundManifestNumber(transition.progress),
    translateX: roundManifestNumber(translateX),
  };
}

function subtitleManifestStyle(style: SubtitleStyle, layout: SubtitleLayout): Record<string, unknown> {
  return {
    bgColor: style.bg_color,
    bgOpacity: style.bg_opacity,
    bgRadius: style.bg_radius,
    bgStyle: style.bg_style,
    color: style.color,
    font: style.font,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    maxCharsPerLine: layout.maxCharsPerLine,
    position: style.position,
    sourceSize: style.size,
  };
}

function roundManifestBox(box: ManifestBox): ManifestBox {
  return {
    height: roundManifestNumber(box.height),
    width: roundManifestNumber(box.width),
    x: roundManifestNumber(box.x),
    y: roundManifestNumber(box.y),
  };
}

function roundManifestNumber(value: number): number {
  return Number(value.toFixed(3));
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
  return formatTimecode(seconds).replace(/^00:/, "");
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
  const previousTarget = Number.parseFloat(decoder.dataset.vcTargetTime ?? "");
  if (
    Number.isFinite(previousTarget)
    && Math.abs(previousTarget - next) < 0.04
    && decoder.dataset.vcSeekReady === "true"
    && Math.abs((decoder.currentTime || 0) - next) < 0.08
  ) {
    return;
  }
  decoder.dataset.vcTargetTime = String(next);
  if (Math.abs((decoder.currentTime || 0) - next) < 0.04 && decoder.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    decoder.dataset.vcSeekReady = "true";
    return;
  }
  try {
    decoder.dataset.vcSeekReady = "false";
    decoder.currentTime = next;
    if (process.env.NODE_ENV === "test") {
      decoder.dataset.vcSeekReady = "true";
    }
  } catch {
    // Ignore decoder seek failures while metadata is loading.
  }
}

function markVideoDecoderReady(decoder: HTMLVideoElement): void {
  if (!decoder.dataset.vcTargetTime) {
    decoder.dataset.vcTargetTime = String(Math.max(0, decoder.currentTime || 0));
    decoder.dataset.vcSeekReady = "true";
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

function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  options: { canvasHeight: number; canvasWidth: number; motionKind?: string; motionProgress?: number; opacity: number; translateX?: number },
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
  const motionCrop = backgroundMotionCrop({
    progress: options.motionProgress ?? 0,
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
    kind: options.motionKind ?? "none",
  });
  context.save();
  context.globalAlpha = clamp(options.opacity, 0, 1);
  const x = ((options.translateX ?? 0) / 100) * options.canvasWidth;
  try {
    context.drawImage(
      source,
      motionCrop.x,
      motionCrop.y,
      motionCrop.width,
      motionCrop.height,
      x,
      0,
      options.canvasWidth,
      options.canvasHeight,
    );
  } catch {
    // Ignore draw errors while image/video resources are still becoming drawable.
  }
  context.restore();
}

function backgroundMotionCrop({
  kind,
  progress,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY,
}: {
  kind: string;
  progress: number;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
}): { height: number; width: number; x: number; y: number } {
  if (kind === "none" || kind === "static") {
    return { height: sourceHeight, width: sourceWidth, x: sourceX, y: sourceY };
  }
  const normalized = clamp(progress, 0, 1);
  const zoom = backgroundMotionZoom(kind, normalized);
  const width = sourceWidth / zoom;
  const height = sourceHeight / zoom;
  const xTravel = Math.max(0, sourceWidth - width);
  const yTravel = Math.max(0, sourceHeight - height);
  let x = sourceX + xTravel / 2;
  let y = sourceY + yTravel / 2;

  if (kind === "pan_left") {
    x = sourceX + xTravel * normalized;
  } else if (kind === "pan_right") {
    x = sourceX + xTravel * (1 - normalized);
  }

  return { height, width, x, y };
}

function backgroundMotionZoom(kind: string, progress: number): number {
  if (kind === "ken_burns_strong") return 1 + 0.18 * progress;
  if (kind === "zoom_out") return 1.12 - 0.12 * progress;
  if (kind === "pan_left" || kind === "pan_right") return 1.08;
  return 1 + 0.08 * progress;
}

function drawPip(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  layer: { motion: { kind: string }; motionProgress: number; opacity: number; placement: { opacity: number; posX: number; posY: number; radius: number; size: number }; translateX: number },
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
    const motionCrop = backgroundMotionCrop({
      kind: layer.motion.kind,
      progress: layer.motionProgress,
      sourceHeight: sourceSize.height,
      sourceWidth: sourceSize.width,
      sourceX: 0,
      sourceY: 0,
    });
    context.drawImage(source, motionCrop.x, motionCrop.y, motionCrop.width, motionCrop.height, x, y, width, height);
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
): ManifestBox {
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
  return { height, width, x, y };
}

function buildSubtitleCueSpans(
  sentences: AlignedSentence[],
  alignmentWords: AlignedWord[],
  maxLineChars: number,
  sentenceTextOverrides: boolean,
): SubtitleCueSpan[] {
  const safeMaxLineChars = normalizeSubtitleMaxLineChars(maxLineChars);
  const wordsBySentence = new Map<number, AlignedWord[]>();
  for (const word of alignmentWords) {
    if (!word.text.trim()) continue;
    const bucket = wordsBySentence.get(word.sentence_index) ?? [];
    bucket.push(word);
    wordsBySentence.set(word.sentence_index, bucket);
  }

  const cues: SubtitleCue[] = [];
  for (const sentence of sentences) {
    const sentenceWords = subtitleWordsForSentence(sentence, wordsBySentence.get(sentence.index) ?? [], sentenceTextOverrides);
    const preserveSentenceEnd = isSentenceSpanTextWord(sentence, sentenceWords.words);
    const readableWords = sentenceWords.words.flatMap((word) => (
      splitOversizedSubtitleWord(word, safeMaxLineChars, sentenceWords.splitLongWordDuration)
    ));
    let start = 0;
    while (start < readableWords.length) {
      const end = bestSubtitleChunkEnd(readableWords, start, safeMaxLineChars);
      cues.push({
        preserveEnd: preserveSentenceEnd && end === readableWords.length,
        words: readableWords.slice(start, end),
      });
      start = end;
    }
  }

  return normalizedSubtitleCueSpans(cues, safeMaxLineChars);
}

function subtitleWordsForSentence(
  sentence: AlignedSentence,
  words: AlignedWord[],
  sentenceTextOverrides: boolean,
): SubtitleSentenceWords {
  if (words.length > 0) {
    return {
      splitLongWordDuration: true,
      words: words.map((word) => ({ ...word, text: word.text.trim() })).filter((word) => word.text.length > 0),
    };
  }
  const text = sentence.text.trim();
  if (!text) return { splitLongWordDuration: sentenceTextOverrides, words: [] };
  return {
    splitLongWordDuration: sentenceTextOverrides,
    words: [{
      confidence: sentence.confidence_avg,
      end_s: sentence.end_s,
      sentence_index: sentence.index,
      start_s: sentence.start_s,
      text,
    }],
  };
}

function splitOversizedSubtitleWord(word: AlignedWord, maxLineChars: number, splitLongDuration: boolean): AlignedWord[] {
  if (fitsSubtitleCue([word], maxLineChars) && (!splitLongDuration || word.end_s - word.start_s <= SUBTITLE_MAX_CUE_SECONDS)) {
    return [word];
  }

  const text = word.text.trim();
  if (!text) return [];
  const textLength = [...text].length;
  const durationSeconds = Math.max(0, word.end_s - word.start_s);
  const maxCueChars = maxLineChars * SUBTITLE_MAX_CUE_LINES;
  const chunkLimit = durationSeconds > 0
    ? Math.min(maxCueChars, Math.max(1, Math.floor(visibleLength(text) * (SUBTITLE_MAX_CUE_SECONDS - 0.001) / durationSeconds)))
    : maxCueChars;
  const fragments = splitSubtitleTextChunks(text, chunkLimit);
  if (fragments.length === 1) {
    return [word];
  }

  const splitWords: AlignedWord[] = [];
  let offset = 0;
  for (const fragment of fragments) {
    const startRatio = offset / textLength;
    offset += [...fragment].length;
    const endRatio = offset / textLength;
    splitWords.push({
      confidence: word.confidence,
      end_s: word.start_s + durationSeconds * endRatio,
      sentence_index: word.sentence_index,
      start_s: word.start_s + durationSeconds * startRatio,
      text: fragment,
    });
  }
  return splitWords;
}

function splitSubtitleTextChunks(text: string, chunkLimit: number): string[] {
  const chars = [...text];
  const chunks: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = visibleChunkEnd(chars, start, chunkLimit);
    if (end < chars.length) {
      const earliestBreak = visibleChunkEnd(chars, start, Math.max(1, Math.floor(chunkLimit / 2)));
      for (let candidate = end; candidate >= earliestBreak; candidate -= 1) {
        const previous = chars[candidate - 1] ?? "";
        if (BREAK_PUNCTUATION.includes(previous)) {
          end = candidate;
          break;
        }
      }
    }
    chunks.push(chars.slice(start, end).join(""));
    start = end;
  }
  return chunks;
}

function visibleChunkEnd(chars: string[], start: number, limit: number): number {
  let end = start;
  let width = 0;
  while (end < chars.length) {
    const nextWidth = isWideCharacter(chars[end] ?? "") ? 2 : 1;
    if (end > start && width + nextWidth > limit) {
      break;
    }
    width += nextWidth;
    end += 1;
  }
  return Math.max(start + 1, end);
}

function normalizedSubtitleCueSpans(cues: SubtitleCue[], maxLineChars: number): SubtitleCueSpan[] {
  const entries = cues
    .filter((cue) => cue.words.length > 0)
    .map((cue) => ({
      cue,
      end_s: cue.words[cue.words.length - 1]?.end_s ?? 0,
      start_s: cue.words[0]?.start_s ?? 0,
    }));
  return entries.map((entry, index) => {
    const nextStart = entries[index + 1]?.start_s;
    let end = entry.end_s;
    if (!entry.cue.preserveEnd && nextStart !== undefined && end < nextStart) {
      end = nextStart;
    }
    if (end <= entry.start_s) {
      end = nextStart !== undefined && nextStart > entry.start_s
        ? nextStart
        : entry.start_s + SUBTITLE_MIN_CUE_SECONDS;
    }
    const lines = wrapSubtitleCueText(subtitleWordsText(entry.cue.words), maxLineChars);
    return {
      end_s: end,
      lines,
      start_s: entry.start_s,
      text: joinSubtitleLines(lines),
    };
  });
}

function bestSubtitleChunkEnd(words: AlignedWord[], start: number, maxLineChars: number): number {
  let limit = start + 1;
  for (let index = start + 1; index <= words.length; index += 1) {
    const chunk = words.slice(start, index);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) break;
    const durationSeconds = last.end_s - first.start_s;
    if (durationSeconds > SUBTITLE_MAX_CUE_SECONDS || !fitsSubtitleCue(chunk, maxLineChars)) {
      break;
    }
    limit = index;
  }

  if (limit === words.length) {
    return limit;
  }

  for (const punctuation of [SENTENCE_PUNCTUATION, CLAUSE_PUNCTUATION]) {
    for (let index = limit - 1; index > start; index -= 1) {
      const text = words[index - 1]?.text.trimEnd() ?? "";
      if (punctuation.some((mark) => text.endsWith(mark))) {
        return index;
      }
    }
  }
  return limit;
}

function fitsSubtitleCue(words: AlignedWord[], maxLineChars: number): boolean {
  const text = subtitleWordsText(words);
  const maxCueChars = maxLineChars * SUBTITLE_MAX_CUE_LINES;
  if (visibleLength(text) > maxCueChars) {
    return false;
  }
  const lines = wrapSubtitleCueText(text, maxLineChars);
  return lines.length <= SUBTITLE_MAX_CUE_LINES && lines.every((line) => visibleLength(line) <= maxLineChars);
}

function wrapSubtitleCueText(text: string, maxLineChars: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitSubtitleTextChunks(word, maxLineChars));
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (visibleLength(candidate) <= maxLineChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function subtitleWordsText(words: AlignedWord[]): string {
  const tokens = words.map((word) => word.text.trim()).filter(Boolean);
  if (tokens.length === 0) return "";
  let text = tokens[0] ?? "";
  for (const token of tokens.slice(1)) {
    const previous = text.at(-1);
    const current = token[0];
    if (previous && current && needsSubtitleSpace(previous, current)) {
      text += " ";
    }
    text += token;
  }
  return text;
}

function joinSubtitleLines(lines: string[]): string {
  let text = "";
  for (const line of lines) {
    if (!line) continue;
    const previous = text.at(-1);
    const current = line[0];
    if (previous && current && needsSubtitleSpace(previous, current)) {
      text += " ";
    }
    text += line;
  }
  return text;
}

function needsSubtitleSpace(previous: string, current: string): boolean {
  return !(
    isCjkCharacter(previous)
    || isCjkCharacter(current)
    || CLOSING_PUNCTUATION.includes(current)
    || OPENING_PUNCTUATION.includes(previous)
  );
}

function isCjkCharacter(character: string): boolean {
  const codepoint = character.codePointAt(0) ?? 0;
  return (
    (0x3400 <= codepoint && codepoint <= 0x4DBF)
    || (0x4E00 <= codepoint && codepoint <= 0x9FFF)
    || (0xF900 <= codepoint && codepoint <= 0xFAFF)
  );
}

function isSentenceSpanTextWord(sentence: AlignedSentence, words: AlignedWord[]): boolean {
  if (words.length !== 1) return false;
  const word = words[0];
  return Boolean(
    word
      && word.text.trim() === sentence.text.trim()
      && Math.abs(word.start_s - sentence.start_s) <= 0.001
      && Math.abs(word.end_s - sentence.end_s) <= 0.001,
  );
}

function activeSubtitleCue(cues: SubtitleCueSpan[], timestamp: number): SubtitleCueSpan | null {
  return cues.find((cue) => cue.start_s <= timestamp && timestamp < cue.end_s) ?? null;
}

function normalizeSubtitleMaxLineChars(value: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), 20, 80) : 42;
}

function drawSubtitle(
  context: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number,
  presetLines?: string[],
): SubtitleLayout | null {
  const normalizedMaxChars = clamp(Math.round(style.max_chars_per_line), 20, 80);
  const fontSize = clamp(Math.round(style.size * 0.58), 16, 42);
  const lineHeight = Math.round(fontSize * 1.24);
  const maxTextWidth = canvasWidth * 0.84;
  const centerX = canvasWidth / 2;
  context.save();
  context.font = `650 ${fontSize}px ${style.font}, Inter, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = presetLines && presetLines.length > 0
    ? presetLines.map((line) => line.trim()).filter(Boolean)
    : limitSubtitleLines(wrapSubtitleLines(text, context, { maxCharsPerLine: normalizedMaxChars, maxWidth: maxTextWidth }), 4);
  if (lines.length === 0) {
    context.restore();
    return null;
  }
  const anchorY = style.position === "top" ? canvasHeight * 0.16 : style.position === "bottom_low" ? canvasHeight * 0.925 : canvasHeight * 0.86;
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
  const paddingX = style.bg_style === "pill" ? 22 : 18;
  const paddingY = 10;
  const widest = lines.reduce((value, line) => Math.max(value, context.measureText(line).width), 0);
  const textBox = {
    height: lines.length * lineHeight,
    width: widest,
    x: centerX - widest / 2,
    y: startY - lineHeight / 2,
  };
  let bbox: ManifestBox = textBox;
  if (style.bg_style === "pill" || style.bg_style === "block") {
    const blockWidth = widest + paddingX * 2;
    const blockHeight = lines.length * lineHeight + paddingY * 2;
    const blockX = centerX - blockWidth / 2;
    const blockY = startY - lineHeight / 2 - paddingY;
    bbox = { height: blockHeight, width: blockWidth, x: blockX, y: blockY };
    context.fillStyle = rgbaFromHex(style.bg_color, style.bg_style === "pill" ? Math.min(style.bg_opacity, 60) : style.bg_opacity);
    if (style.bg_style === "pill") {
      drawRoundedRectPath(context, blockX, blockY, blockWidth, blockHeight, blockHeight / 2);
      context.fill();
    } else {
      context.fillRect(blockX, blockY, blockWidth, blockHeight);
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
    context.fillStyle = style.color;
    context.fillText(line, centerX, y);
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }
  context.restore();
  return {
    bbox,
    fontSize,
    lineHeight,
    lines,
    maxCharsPerLine: normalizedMaxChars,
  };
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
    activeBackgrounds: string[];
    drawOrder: string[];
    hasBackground: boolean;
    hasForeground: boolean;
    hasPip: boolean;
    pipCount: number;
    pipBoxes: Array<{ height: number; mediaId: string; width: number; x: number; y: number }>;
    playing: boolean;
    renderManifest: PreviewRenderManifest;
    subtitlePosition: string;
    subtitleVisible: boolean;
    watermarkVisible: boolean;
  },
): void {
  canvas.dataset.activeBackgrounds = metadata.activeBackgrounds.join(",");
  canvas.dataset.drawOrder = metadata.drawOrder.join(">");
  canvas.dataset.hasBackground = metadata.hasBackground ? "true" : "false";
  canvas.dataset.hasForeground = metadata.hasForeground ? "true" : "false";
  canvas.dataset.hasPip = metadata.hasPip ? "true" : "false";
  canvas.dataset.pipBoxes = JSON.stringify(metadata.pipBoxes);
  canvas.dataset.pipCount = String(metadata.pipCount);
  canvas.dataset.renderManifest = JSON.stringify(metadata.renderManifest);
  canvas.dataset.subtitleVisible = metadata.subtitleVisible ? "true" : "false";
  canvas.dataset.subtitlePosition = metadata.subtitlePosition;
  canvas.dataset.watermarkVisible = metadata.watermarkVisible ? "true" : "false";
  canvas.dataset.playing = metadata.playing ? "true" : "false";
  window.__VC_PREVIEW_RENDER_MANIFEST__ = metadata.renderManifest;
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

function rgbaFromHex(hexColor: string, opacityPercent: number): string {
  const color = hexColor.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(color)) {
    return `rgba(0, 0, 0, ${clamp(opacityPercent, 0, 100) / 100})`;
  }
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacityPercent, 0, 100) / 100})`;
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
