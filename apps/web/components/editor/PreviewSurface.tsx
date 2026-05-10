import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { EditorStateProps } from "./types";

type PreviewSurfaceProps = Pick<EditorStateProps, "currentTime" | "duration" | "layers" | "projectPath" | "sentences"> & {
  fitMode: string;
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
  playing: boolean;
  resolution: string;
};

export function PreviewSurface({ currentTime, duration, fitMode, layers, onNext, onPrevious, onTogglePlay, playing, projectPath, resolution, sentences }: PreviewSurfaceProps) {
  const t = useTranslations("pages.editor.transport");
  const display = resolveDisplay(layers, sentences, currentTime);
  const baseImage = display.bg?.mediaId ?? display.fg[0]?.mediaId;
  const baseOpacity = display.bg?.opacity ?? display.fg[0]?.opacity ?? 1;
  const baseTranslateX = display.bg ? 0 : display.fg[0]?.translateX ?? 0;
  const overlayForegrounds = display.bg ? display.fg : display.fg.slice(1);
  const aspectClass = resolution === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const objectClass = fitMode === "actual" ? "object-scale-down" : "object-contain";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-(--bg-0)">
        <div className={`relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-md bg-(--bg-2) ${aspectClass}`}>
          {baseImage ? (
            <img
              alt=""
              className={`absolute inset-0 h-full w-full ${objectClass}`}
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
            <img
              alt=""
              className={`absolute inset-0 h-full w-full ${objectClass}`}
              key={`${layer.mediaId}-${index}`}
              src={mediaUrl(projectPath, layer.mediaId)}
              style={{
                opacity: layer.opacity,
                transform: `translateX(${layer.translateX}%)`,
              }}
            />
          ))}
          {display.pip.map((layer, index) => (
            <img
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
            <div className="absolute inset-x-0 bottom-[7%] px-[8%] text-center text-[clamp(14px,2vw,28px)] font-semibold text-white drop-shadow-md">
              {display.subtitle.text}
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 rounded bg-(--bg-2)/40 px-2 py-1 text-xs font-semibold text-white">VC</div>
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
