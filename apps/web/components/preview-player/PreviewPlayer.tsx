"use client";

import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type Props = {
  projectPath: string;
  layers: Layer[];
  sentences: AlignedSentence[];
  currentTime: number;
};

export function PreviewPlayer({ projectPath, layers, sentences, currentTime }: Props) {
  const spec = resolveDisplay(layers, sentences, currentTime);

  function fileUrl(mediaId: string) {
    return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(mediaId)}`;
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: "16/9" }}
    >
      {/* BG layer — always visible when set */}
      {spec.bg && (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          src={fileUrl(spec.bg.mediaId)}
          style={{ opacity: spec.bg.opacity }}
        />
      )}

      {/* FG layers — active item overlaid fullscreen */}
      {spec.fg.map((item) => (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          key={item.mediaId}
          src={fileUrl(item.mediaId)}
          style={{ opacity: item.opacity }}
        />
      ))}

      {/* PiP layers */}
      {spec.pip.map((item) => (
        <img
          alt=""
          className="absolute overflow-hidden object-cover transition-opacity duration-300"
          key={item.mediaId}
          src={fileUrl(item.mediaId)}
          style={{
            left: `${item.placement.posX}%`,
            top: `${item.placement.posY}%`,
            width: `${item.placement.size}%`,
            borderRadius: item.placement.radius,
            opacity: item.opacity * (item.placement.opacity / 100),
          }}
        />
      ))}

      {/* Subtitle */}
      {spec.subtitle && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center px-8">
          <p className="rounded bg-black/60 px-3 py-1 text-center text-sm text-white shadow">
            {spec.subtitle.text}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!spec.bg && spec.fg.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30">
          No media assigned
        </div>
      )}
    </div>
  );
}
