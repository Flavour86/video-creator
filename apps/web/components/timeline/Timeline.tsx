"use client";

import { TimelineRuler } from "./TimelineRuler";
import { TimelineTrack } from "./TimelineTrack";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type Props = {
  layers: Layer[];
  sentences: AlignedSentence[];
  duration: number;
  currentTime: number;
  projectPath: string;
  onSeek: (time: number) => void;
};

const TRACK_ORDER: Layer["kind"][] = ["sub", "pip", "fg", "bg"];

export function Timeline({
  layers,
  sentences,
  duration,
  currentTime,
  projectPath,
  onSeek,
}: Props) {
  // Sort layers into display order: sub → pip → fg → bg
  const sorted = [...layers].sort(
    (a, b) => TRACK_ORDER.indexOf(a.kind) - TRACK_ORDER.indexOf(b.kind),
  );

  // Always show a Subtitles placeholder row if alignment exists
  const hasSub = sorted.some((l) => l.kind === "sub");
  const displayLayers: Layer[] = hasSub
    ? sorted
    : sentences.length > 0
      ? [{ id: "sub-placeholder", kind: "sub", name: "Subtitles", items: [] }, ...sorted]
      : sorted;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-1.5">
        <span className="font-semibold uppercase tracking-widest opacity-40 text-[10px]">
          Timeline
        </span>
        <span className="tabular-nums opacity-30 text-[10px]">
          {duration > 0 ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, "0")}` : "--:--"} · 30 fps
        </span>
      </div>

      {/* Ruler */}
      <div className="flex">
        <div className="w-24 shrink-0" />
        <div className="flex-1">
          <TimelineRuler
            currentTime={currentTime}
            duration={duration}
            onSeek={onSeek}
          />
        </div>
      </div>

      {/* Tracks */}
      {displayLayers.map((layer) => (
        <TimelineTrack
          currentTime={currentTime}
          duration={duration}
          key={layer.id}
          layer={layer}
          projectPath={projectPath}
          sentences={layer.kind === "sub" ? sentences : undefined}
        />
      ))}

      {displayLayers.length === 0 && (
        <div className="py-4 text-center opacity-30">No layers yet</div>
      )}
    </div>
  );
}
