"use client";

import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

type Props = {
  layer: Layer;
  duration: number;
  currentTime: number;
  sentences?: AlignedSentence[];
  projectPath?: string;
};

function SentenceChips({
  sentences,
  duration,
}: {
  sentences: AlignedSentence[];
  duration: number;
}) {
  return (
    <div className="relative h-7 w-full overflow-hidden">
      {sentences.map((s) => {
        const left = (s.start_s / duration) * 100;
        const width = ((s.end_s - s.start_s) / duration) * 100;
        return (
          <div
            className="absolute top-1 flex h-5 items-center overflow-hidden rounded-sm bg-slate-200 px-1"
            key={s.index}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
            title={s.text}
          >
            <span className="truncate text-[9px] text-slate-600">s{s.index}</span>
          </div>
        );
      })}
    </div>
  );
}

function BgBlock({
  layer,
  duration,
  projectPath,
}: {
  layer: Extract<Layer, { kind: "bg" }>;
  duration: number;
  projectPath?: string;
}) {
  const item = layer.items[0];
  if (!item) return <div className="h-7 w-full bg-neutral-100 rounded" />;
  const thumbUrl = projectPath
    ? `/api/server/projects/thumb?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.mediaId.replace(/\.[^.]+$/, ".jpg"))}`
    : undefined;

  return (
    <div className="relative h-7 w-full overflow-hidden rounded bg-neutral-200">
      {thumbUrl && (
        <img alt="" className="h-full w-full object-cover opacity-60" src={thumbUrl} />
      )}
      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium opacity-70 truncate">
        {item.mediaId}
      </span>
    </div>
  );
}

export function TimelineTrack({ layer, duration, currentTime, sentences, projectPath }: Props) {
  const label = layer.name;

  return (
    <div className="flex min-h-[32px] items-center border-t border-neutral-100">
      <div className="w-24 shrink-0 px-2 text-right">
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-40 truncate">
          {label}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {layer.kind === "sub" && sentences && duration > 0 && (
          <SentenceChips duration={duration} sentences={sentences} />
        )}
        {layer.kind === "bg" && duration > 0 && (
          <BgBlock duration={duration} layer={layer as Extract<Layer, { kind: "bg" }>} projectPath={projectPath} />
        )}
        {(layer.kind === "fg" || layer.kind === "pip") && (
          <div className="h-7" />
        )}
        {/* Playhead */}
        {duration > 0 && (
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-amber-400/70"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
