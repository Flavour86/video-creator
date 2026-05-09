import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { formatDuration } from "@/lib/format";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { EditorSelection } from "./types";

type TimelineProps = {
  currentTime: number;
  duration: number;
  layers: Layer[];
  onSeek: (time: number) => void;
  onSelect: (selection: EditorSelection) => void;
  selected: EditorSelection;
};

const order: Layer["kind"][] = ["sub", "pip", "fg", "bg"];

type TimelineItem = {
  end: number;
  id: string;
  mediaId: string;
  start: number;
};

export function Timeline({ currentTime, duration, layers, onSeek, onSelect, selected }: TimelineProps) {
  const t = useTranslations("pages.editor");
  const sorted = [...layers].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const clips = layers.reduce((total, layer) => total + layer.items.length, 0);
  const playheadLeft = `${Math.min(100, Math.max(0, (currentTime / Math.max(duration, 1)) * 100))}%`;

  return (
    <section className="relative flex h-[302px] shrink-0 flex-col border-t border-(--line) bg-(--bg-1)">
      <div className="flex items-center justify-between px-4 py-2 font-mono text-[11px] text-(--text-3)">
        <h3 className="text-[11px] font-semibold">{t("timeline.head")}</h3>
        <span>30 fps · {clips} clips · cache 24/24</span>
      </div>
      <button className="relative h-[22px] border-y border-(--line-soft)" onClick={(event) => onSeek(timeFromEvent(event, duration))} type="button">
        {Array.from({ length: 8 }, (_, index) => (
          <span className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-(--text-3)" key={index} style={{ left: `${(index / 7) * 100}%` }}>
            {formatDuration((duration / 7) * index)}
          </span>
        ))}
      </button>
      <button className="relative h-[60px] overflow-hidden" onClick={(event) => onSeek(timeFromEvent(event, duration))} type="button">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-px px-2">
          {Array.from({ length: 96 }, (_, index) => (
            <span className="w-px rounded bg-(--bg-5)" key={index} style={{ height: `${12 + ((index * 17) % 38)}px` }} />
          ))}
        </div>
      </button>
      <div className="relative">
        {sorted.map((layer) => (
          <TrackRow duration={duration} key={layer.id} layer={layer} onSelect={onSelect} selected={selected} />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-0 top-[64px] w-px bg-(--amber)" style={{ left: playheadLeft }}>
        <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-(--amber)" />
      </div>
    </section>
  );
}

function TrackRow({ duration, layer, onSelect, selected }: { duration: number; layer: Layer; onSelect: (selection: EditorSelection) => void; selected: EditorSelection }) {
  return (
    <div className="grid h-[44px] grid-cols-[80px_minmax(0,1fr)] items-center border-t border-(--line-soft)">
      <div className="truncate px-3 font-mono text-[11px] uppercase text-(--text-3)">
        {labelFor(layer)}
      </div>
      <button className="relative h-full" onClick={() => onSelect(null)} type="button">
        {layer.items.map((item) => {
          if (!isTimelineItem(item)) return null;
          const left = `${(item.start / Math.max(duration, 1)) * 100}%`;
          const width = `${Math.max(1, ((item.end - item.start) / Math.max(duration, 1)) * 100)}%`;
          const isSelected = selected?.layerId === layer.id && selected.itemId === item.id;
          return (
            <span
              aria-label={item.mediaId}
              className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-sm border text-left font-mono text-[11px] text-(--text) ${clipClass(layer.kind)} ${isSelected ? "outline outline-2 outline-(--amber)" : ""}`}
              key={item.id}
              onClick={(event) => {
                event.stopPropagation();
                if (layer.kind !== "sub") onSelect({ layerId: layer.id, itemId: item.id });
              }}
              style={{ left, width }}
            >
              <span className="absolute left-2 top-1/2 -translate-y-1/2 truncate">{item.mediaId}</span>
            </span>
          );
        })}
      </button>
    </div>
  );
}

function clipClass(kind: Layer["kind"]): string {
  if (kind === "sub") return "border-(--blue) bg-(--blue)/70";
  if (kind === "pip") return "border-(--violet) bg-(--violet)/70";
  if (kind === "bg") return "border-(--amber-2) bg-(--amber-2)/40";
  return "border-(--amber) bg-(--amber)/70";
}

function labelFor(layer: Layer): string {
  return `${layer.name} · ${layer.items.length}`;
}

function timeFromEvent(event: MouseEvent<HTMLElement>, duration: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return ((event.clientX - rect.left) / Math.max(rect.width, 1)) * duration;
}

function isTimelineItem(item: unknown): item is TimelineItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "end" in item &&
    typeof item.end === "number" &&
    "id" in item &&
    typeof item.id === "string" &&
    "mediaId" in item &&
    typeof item.mediaId === "string" &&
    "start" in item &&
    typeof item.start === "number"
  );
}
