import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { EditorStateProps } from "./types";

type PreviewSurfaceProps = Pick<EditorStateProps, "currentTime" | "duration" | "layers" | "projectPath" | "sentences"> & {
  onNext: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
  playing: boolean;
};

export function PreviewSurface({ currentTime, duration, layers, onNext, onPrevious, onTogglePlay, playing, projectPath, sentences }: PreviewSurfaceProps) {
  const t = useTranslations("pages.editor.transport");
  const display = resolveDisplay(layers, sentences, currentTime);
  const background = display.bg?.mediaId;
  const foreground = display.fg[0]?.mediaId;
  const pip = display.pip[0];
  const image = foreground ?? background;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-(--bg-0)">
        <div className="relative aspect-video h-full max-h-full w-auto max-w-full overflow-hidden rounded-md bg-(--bg-2)">
          {image ? (
            <img alt="" className="h-full w-full object-cover" src={mediaUrl(projectPath, image)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-(--text-3)">No media assigned</div>
          )}
          {pip ? (
            <img
              alt=""
              className="absolute object-cover shadow-(--shadow-2)"
              src={mediaUrl(projectPath, pip.mediaId)}
              style={{
                borderRadius: `${pip.placement.radius}px`,
                left: `${pip.placement.posX}%`,
                opacity: pip.opacity / 100,
                top: `${pip.placement.posY}%`,
                width: `${pip.placement.size}%`,
              }}
            />
          ) : null}
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
