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
  const baseImage = display.bg?.mediaId ?? display.fg[0]?.mediaId;
  const baseOpacity = display.bg?.opacity ?? display.fg[0]?.opacity ?? 1;
  const baseTranslateX = display.bg ? 0 : display.fg[0]?.translateX ?? 0;
  const overlayForegrounds = display.bg ? display.fg : display.fg.slice(1);
  const aspectClass = resolution === "9:16" ? "aspect-[9/16]" : "aspect-video";
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
  const watermarkScale = clamp(watermark?.scale ?? 0.08, 0.02, 0.5) * 100;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-(--bg-0)">
        <div className={`relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-md bg-(--bg-2) ${aspectClass}`}>
          {baseImage ? (
            <Image
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              src={mediaUrl(projectPath, baseImage)}
              style={{
                opacity: baseOpacity,
                transform: `translateX(${baseTranslateX}%)`,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-(--text-3)">No media assigned</div>
          )}
          {overlayForegrounds.map((layer, index) => (
            <Image
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
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
              key={`${layer.mediaId}-${index}`}
              src={mediaUrl(projectPath, layer.mediaId)}
              style={{
                borderRadius: `${layer.placement.radius}px`,
                left: `${layer.placement.posX}%`,
                opacity: layer.opacity / 100,
                top: `${layer.placement.posY}%`,
                transform: `translateX(${layer.translateX}%)`,
                width: `${layer.placement.size}%`,
              }}
            />
          ))}
          {display.subtitle ? (
            <div
              className={`absolute inset-x-[8%] text-center font-semibold text-white ${subtitlePositionClass} ${subtitleBackgroundClass}`}
              style={{
                fontFamily: subtitleStyle.font,
                fontSize: `${subtitleFontSize}px`,
              }}
            >
              {display.subtitle.text}
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
