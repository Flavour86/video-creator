import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import { IconButton } from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import Image from "next/image";
import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { EditorStateProps } from "./types";

type PreviewSurfaceProps = Pick<EditorStateProps, "currentTime" | "duration" | "layers" | "projectPath" | "sentences"> & {
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
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

export function PreviewSurface({
  currentTime,
  duration,
  layers,
  onNext,
  onPrevious,
  onTogglePlay,
  playing,
  projectPath,
  resolution,
  sentences,
  subtitles,
  watermark,
}: PreviewSurfaceProps) {
  const t = useTranslations("pages.editor.transport");
  const display = resolveDisplay(layers, sentences, currentTime);
  const hasActiveForeground = display.fg.length > 0;
  const background = hasActiveForeground ? undefined : display.bg;
  const aspectClass = resolution === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const subtitlesEnabled = subtitles?.burn_in === true;
  const subtitleStyle = subtitles?.style ?? FALLBACK_SUBTITLE_STYLE;
  const subtitlePositionClass =
    subtitleStyle.position === "top" ? "top-[7%]" : subtitleStyle.position === "bottom_low" ? "bottom-[3%]" : "bottom-[7%]";
  const subtitleBackgroundClass =
    subtitleStyle.bg_style === "pill"
      ? "rounded-full bg-black/60 px-5 py-2"
      : subtitleStyle.bg_style === "block"
        ? "rounded-md bg-black/80 px-4 py-2"
        : subtitleStyle.bg_style === "shadow"
          ? "drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          : "";
  const subtitleFontSize = Math.max(14, Math.round(subtitleStyle.size));
  const subtitleText = display.subtitle ? wrapSubtitle(display.subtitle.text, subtitleStyle.max_chars_per_line) : null;
  const watermarkScale = clamp(watermark?.scale ?? 0.08, 0.02, 0.5) * 100;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-(--bg-0)">
        <div
          className={`relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-md border border-(--line-soft) bg-(--bg-2) shadow-(--shadow-1) ${aspectClass}`}
          data-testid="preview-stage"
        >
          <div className="absolute inset-0 bg-black" data-testid="preview-black-fallback" />
          {background ? (
            <Image
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              data-testid="preview-background"
              src={mediaUrl(projectPath, background.mediaId)}
              style={{
                opacity: background.opacity,
              }}
            />
          ) : null}
          {display.fg.map((layer, index) => (
            <Image
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              data-testid="preview-foreground"
              key={`${layer.mediaId}-${index}`}
              src={mediaUrl(projectPath, layer.mediaId)}
              style={{
                opacity: layer.opacity,
                transform: `translateX(${layer.translateX}%)`,
              }}
            />
          ))}
          {display.pip.map((layer, index) => (
            <Image
              alt=""
              className="absolute object-cover shadow-(--shadow-2)"
              data-testid="preview-pip"
              key={`${layer.mediaId}-${index}`}
              src={mediaUrl(projectPath, layer.mediaId)}
              style={{
                borderRadius: `${layer.placement.radius}px`,
                left: `${layer.placement.posX}%`,
                opacity: (layer.opacity * layer.placement.opacity) / 100,
                top: `${layer.placement.posY}%`,
                transform: `translateX(${layer.translateX}%)`,
                width: `${layer.placement.size}%`,
              }}
            />
          ))}
          {subtitlesEnabled && subtitleText ? (
            <div
              className={`absolute inset-x-[8%] text-center font-semibold text-white ${subtitlePositionClass} ${subtitleBackgroundClass}`}
              data-subtitle-bg-style={subtitleStyle.bg_style}
              data-subtitle-max-chars={subtitleStyle.max_chars_per_line}
              data-subtitle-position={subtitleStyle.position}
              data-testid="preview-subtitle"
              style={{
                fontFamily: subtitleStyle.font,
                fontSize: `${subtitleFontSize}px`,
                whiteSpace: "pre-line",
              }}
            >
              {subtitleText}
            </div>
          ) : null}
          {watermark ? (
            <Image
              alt=""
              className="absolute object-contain"
              data-testid="preview-watermark"
              src={mediaUrl(projectPath, watermark.mediaId)}
              style={{
                left: `${clamp(watermark.posX, 0, 100)}%`,
                opacity: clamp(watermark.opacity, 0, 100) / 100,
                top: `${clamp(watermark.posY, 0, 100)}%`,
                transform: "translate(-50%, -50%)",
                width: `${watermarkScale}%`,
              }}
            />
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-(--line) px-4 py-2">
        <div className="flex items-center gap-2">
          <IconButton icon={SkipBack} label={t("prev")} onClick={onPrevious} />
          <IconButton icon={playing ? Pause : Play} label={playing ? t("pause") : t("play")} onClick={onTogglePlay} variant="primary" />
          <IconButton icon={SkipForward} label={t("next")} onClick={onNext} />
        </div>
        <div className="font-mono text-[12px]">
          <span className="text-(--amber)">{formatTimecode(currentTime, { ms: true })}</span>
          <span className="mx-2 text-(--text-3)">/</span>
          <span className="text-(--text-3)">{formatTimecode(duration, { ms: true })}</span>
        </div>
      </div>
    </section>
  );
}

function mediaUrl(projectPath: string, filename: string): string {
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(filename)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapSubtitle(text: string, maxCharsPerLine: number): string {
  const limit = Math.max(1, Math.floor(maxCharsPerLine));
  const source = text.trim();
  if (source.length <= limit) {
    return source;
  }

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return splitHard(source, limit).join("\n");
  }

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > limit) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(...splitHard(word, limit));
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.join("\n");
}

function splitHard(text: string, limit: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}
