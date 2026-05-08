"use client";

import { resolveDisplay } from "@/lib/preview/resolveDisplay";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { WatermarkSettings } from "@/lib/hooks/useProject";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type Props = {
  projectPath: string;
  layers: Layer[];
  sentences: AlignedSentence[];
  currentTime: number;
  watermark?: WatermarkSettings | null;
};

export function PreviewPlayer({ projectPath, layers, sentences, currentTime, watermark }: Props) {
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

      {watermark && (
        <img
          alt=""
          className="absolute object-contain"
          src={fileUrl(watermark.mediaId)}
          style={{
            left: `${watermark.posX}%`,
            top: `${watermark.posY}%`,
            width: `${watermark.scale * 100}%`,
            opacity: watermark.opacity / 100,
            transform: `translate(${-watermark.posX}%, ${-watermark.posY}%)`,
          }}
        />
      )}

      {/* Empty state */}
      {!spec.bg && spec.fg.length === 0 && !watermark && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30">
          No media assigned
        </div>
      )}
    </div>
  );
}
