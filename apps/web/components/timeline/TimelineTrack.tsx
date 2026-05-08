"use client";

import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

type Props = {
  layer: Layer;
  duration: number;
  currentTime: number;
  sentences?: AlignedSentence[];
  projectPath?: string;
  selectedItemId?: string | null;
  onSelectItem?: (layerId: string, itemId: string) => void;
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
  if (layer.items.length === 0) return <div className="h-7 w-full rounded bg-neutral-100" />;

  return (
    <div className="relative h-7 w-full overflow-hidden rounded bg-neutral-200">
      {layer.items.map((item) => {
        const left = (item.start / duration) * 100;
        const width = ((item.end - item.start) / duration) * 100;
        const thumbUrl = projectPath
          ? `/api/server/projects/thumb?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.mediaId.replace(/\.[^.]+$/, ".jpg"))}`
          : undefined;
        return (
          <div
            className="absolute inset-y-0 overflow-hidden border-r border-white/50"
            key={item.id}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
          >
            {thumbUrl && (
              <img alt="" className="h-full w-full object-cover opacity-60" src={thumbUrl} />
            )}
            <span className="absolute inset-0 flex truncate px-2 text-[10px] font-medium opacity-70">
              {item.mediaId}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FgBlocks({
  layer,
  duration,
  selectedItemId,
  onSelectItem,
}: {
  layer: Extract<Layer, { kind: "fg" | "pip" }>;
  duration: number;
  selectedItemId?: string | null;
  onSelectItem?: (layerId: string, itemId: string) => void;
}) {
  type VisualItem = { id: string; mediaId: string; start: number; end: number; motion: { kind: string } };
  return (
    <div className="relative h-7 w-full overflow-hidden">
      {(layer.items as VisualItem[]).map((item) => {
        const left = (item.start / duration) * 100;
        const width = ((item.end - item.start) / duration) * 100;
        const isSelected = item.id === selectedItemId;
        return (
          <button
            className={`absolute top-1 flex h-5 cursor-pointer items-center overflow-hidden rounded-sm px-1 text-left transition-colors ${
              isSelected
                ? "border border-sky-500 bg-sky-200 text-sky-800"
                : "bg-violet-200 text-violet-800 hover:bg-violet-300"
            }`}
            key={item.id}
            onClick={() => onSelectItem?.(layer.id, item.id)}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
            title={`${item.mediaId} · ${item.motion.kind}`}
            type="button"
          >
            <span className="truncate text-[9px] font-medium">{item.mediaId}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TimelineTrack({ layer, duration, currentTime, sentences, projectPath, selectedItemId, onSelectItem }: Props) {
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
        {(layer.kind === "fg" || layer.kind === "pip") && duration > 0 && (
          <FgBlocks
            duration={duration}
            layer={layer as Extract<Layer, { kind: "fg" | "pip" }>}
            onSelectItem={onSelectItem}
            selectedItemId={selectedItemId}
          />
        )}
        {(layer.kind === "fg" || layer.kind === "pip") && duration === 0 && (
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
