import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent } from "react";
import { formatDuration } from "@/lib/format";
import { packRowsByTime } from "@/lib/layers";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { EditorSelection } from "./types";

type TimelineProps = {
  cacheLabel: string;
  currentTime: number;
  duration: number;
  fps: number;
  layers: Layer[];
  onDeleteItem: (selection: { layerId: string; itemId: string }) => void;
  onSeek: (time: number) => void;
  onSelect: (selection: EditorSelection) => void;
  onUpdateClipTiming: (input: { layerId: string; itemId: string; start: number; end: number }) => void;
  selected: EditorSelection;
};

type LayerKind = Layer["kind"];
type DragMode = "move" | "resize-start" | "resize-end";

type TimelineClip = {
  end: number;
  id: string;
  kind: LayerKind;
  layerId: string;
  mediaId: string;
  orphaned?: boolean;
  sentences?: [number, number];
  start: number;
};

type TimelineRow = {
  kind: LayerKind;
  label: string;
  rowId: string;
  clips: TimelineClip[];
};

type DragState = {
  mode: DragMode;
  clip: TimelineClip;
  lastClientX: number;
  originEnd: number;
  originStart: number;
  startClientX: number;
  trackWidth: number;
};

const KINDS: LayerKind[] = ["bg", "fg", "pip", "sub"];
const MIN_DURATION_SECONDS = 0.5;

export function Timeline({
  cacheLabel,
  currentTime,
  duration,
  fps,
  layers,
  onDeleteItem,
  onSeek,
  onSelect,
  onUpdateClipTiming,
  selected,
}: TimelineProps) {
  const t = useTranslations("pages.editor");
  const dragStateRef = useRef<DragState | null>(null);
  const rows = useTimelineRows(layers);
  const clipCount = rows.reduce((total, row) => total + row.clips.length, 0);
  const playheadLeft = `${Math.min(100, Math.max(0, (currentTime / Math.max(duration, 1)) * 100))}%`;

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const patch = computeDragPatch(drag, event.clientX, duration);
      drag.lastClientX = event.clientX;
      onSeek(patch.start);
    }

    function onMouseUp(event: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const clientX = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : drag.lastClientX;
      const patch = computeDragPatch(drag, clientX, duration);
      onUpdateClipTiming({
        layerId: drag.clip.layerId,
        itemId: drag.clip.id,
        start: patch.start,
        end: patch.end,
      });
      onSeek(patch.start);
      dragStateRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [duration, onSeek, onUpdateClipTiming]);

  return (
    <section className="relative flex h-[302px] shrink-0 flex-col border-t border-(--line) bg-(--bg-1)">
      <div className="flex items-center justify-between px-4 py-2 font-mono text-[11px] text-(--text-3)">
        <h3 className="text-[11px] font-semibold">{t("timeline.head")}</h3>
        <span>{fps} fps · {clipCount} clips · {cacheLabel}</span>
      </div>

      <button
        className="relative h-[22px] border-y border-(--line-soft)"
        onClick={(event) => onSeek(timeFromEvent(event, duration))}
        type="button"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <span
            className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-(--text-3)"
            key={index}
            style={{ left: `${(index / 7) * 100}%` }}
          >
            {formatDuration((duration / 7) * index)}
          </span>
        ))}
      </button>

      <button
        className="relative h-[60px] overflow-hidden"
        onClick={(event) => onSeek(timeFromEvent(event, duration))}
        type="button"
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-2" data-testid="timeline-waveform">
          <div className="flex w-full items-center gap-px">
            {Array.from({ length: 120 }, (_, index) => (
              <span
                className="w-px flex-1 rounded bg-(--bg-5)"
                key={index}
                style={{ height: `${12 + ((index * 13) % 38)}px` }}
              />
            ))}
          </div>
        </div>
      </button>

      <div className="relative flex-1 overflow-y-auto">
        {rows.map((row) => (
          <TrackRow
            duration={duration}
            key={row.rowId}
            onDeleteItem={onDeleteItem}
            onSelect={onSelect}
            onStartDrag={(input) => {
              dragStateRef.current = input;
            }}
            row={row}
            selected={selected}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-0 top-[64px] w-px bg-(--amber)" style={{ left: playheadLeft }}>
        <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-(--amber)" />
      </div>
    </section>
  );
}

function useTimelineRows(layers: Layer[]): TimelineRow[] {
  const sorted = [...layers].sort((left, right) => KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind));
  const rows: TimelineRow[] = [];

  for (const layer of sorted) {
    const clips = layer.items
      .filter(isTimelineItem)
      .map((item) => ({
        id: item.id,
        layerId: layer.id,
        kind: layer.kind,
        mediaId: resolveMediaLabel(item) || "subtitle",
        sentences: item.sentences,
        start: item.start,
        end: item.end,
        orphaned: item.orphaned,
      }));

    if (layer.kind === "sub") {
      rows.push({
        kind: "sub",
        label: `${layer.name} · 1`,
        rowId: `${layer.id}-0`,
        clips,
      });
      continue;
    }

    if (clips.length === 0) continue;
    if (layer.kind === "fg" || layer.kind === "pip") {
      const packed = packRowsByTime(clips);
      const label = labelFor(layer.kind, layer.name, clips.length);
      packed.forEach((rowClips, index) => {
        rows.push({ kind: layer.kind, label, rowId: `${layer.id}-${index}`, clips: rowClips });
      });
      continue;
    }
    rows.push({
      kind: "bg",
      label: labelFor("bg", layer.name, clips.length),
      rowId: `${layer.id}-0`,
      clips,
    });
  }

  return rows;
}

type TrackRowProps = {
  duration: number;
  onDeleteItem: (selection: { layerId: string; itemId: string }) => void;
  onSelect: (selection: EditorSelection) => void;
  onStartDrag: (input: DragState) => void;
  row: TimelineRow;
  selected: EditorSelection;
};

function TrackRow({ duration, onDeleteItem, onSelect, onStartDrag, row, selected }: TrackRowProps) {
  return (
    <div className="grid h-[44px] grid-cols-[80px_minmax(0,1fr)] items-center border-t border-(--line-soft)" data-testid={`timeline-row-${row.kind}`}>
      <div className="truncate px-3 font-mono text-[11px] uppercase text-(--text-3)">
        {row.label}
      </div>
      <div className="relative h-full" data-timeline-track="1" onClick={() => onSelect(null)}>
        {row.clips.map((clip) => {
          const left = `${(clip.start / Math.max(duration, 1)) * 100}%`;
          const width = `${Math.max(1, ((clip.end - clip.start) / Math.max(duration, 1)) * 100)}%`;
          const isSelected = selected?.layerId === clip.layerId && selected.itemId === clip.id;
          const label = clipLabel(clip);
          const canDelete = clip.kind !== "bg" && clip.kind !== "sub";
          return (
            <div
              className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-sm border font-mono text-[11px] ${clipClass(clip.kind, clip.orphaned === true)} ${isSelected ? "outline outline-2 outline-(--amber)" : ""}`}
              key={clip.id}
              style={{ left, width }}
            >
              <button
                aria-label={label}
                className="absolute inset-0 rounded-sm pr-8 text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ layerId: clip.layerId, itemId: clip.id });
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onStartDrag(makeDragState(event, clip, "move"));
                }}
                type="button"
              >
                <span className="absolute left-2 top-1/2 max-w-[calc(100%-16px)] -translate-y-1/2 truncate">{label}</span>
              </button>

              <button
                aria-label={`Resize start ${label}`}
                className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize rounded-l-sm"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onStartDrag(makeDragState(event, clip, "resize-start"));
                }}
                type="button"
              />
              <button
                aria-label={`Resize end ${label}`}
                className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize rounded-r-sm"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onStartDrag(makeDragState(event, clip, "resize-end"));
                }}
                type="button"
              />

              {canDelete ? (
                <button
                  aria-label={`Delete ${label}`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-(--text-2) hover:text-(--text)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteItem({ layerId: clip.layerId, itemId: clip.id });
                  }}
                  type="button"
                >
                  x
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function makeDragState(
  event: ReactMouseEvent<HTMLElement>,
  clip: TimelineClip,
  mode: DragMode,
): DragState {
  const track = event.currentTarget.closest("[data-timeline-track='1']");
  const rect = track?.getBoundingClientRect();
  const width = rect && rect.width > 0 ? rect.width : 100;
  return {
    mode,
    clip,
    lastClientX: event.clientX,
    originEnd: clip.end,
    originStart: clip.start,
    startClientX: event.clientX,
    trackWidth: width,
  };
}

function computeDragPatch(state: DragState, clientX: number, duration: number): { end: number; start: number } {
  const effectiveDuration = Math.max(duration, MIN_DURATION_SECONDS);
  const deltaPx = clientX - state.startClientX;
  const deltaTime = (deltaPx / Math.max(state.trackWidth, 1)) * effectiveDuration;
  const span = state.originEnd - state.originStart;
  const maxStart = Math.max(0, effectiveDuration - span);
  if (state.mode === "move") {
    const start = clamp(state.originStart + deltaTime, 0, maxStart);
    return { start, end: start + span };
  }
  if (state.mode === "resize-start") {
    const start = clamp(state.originStart + deltaTime, 0, state.originEnd - MIN_DURATION_SECONDS);
    return { start, end: state.originEnd };
  }
  const end = clamp(state.originEnd + deltaTime, state.originStart + MIN_DURATION_SECONDS, effectiveDuration);
  return { start: state.originStart, end };
}

function labelFor(kind: Exclude<LayerKind, "sub">, name: string, count: number): string {
  if (kind === "bg") {
    return `${name} · ${count} ${count === 1 ? "strip" : "strips"}`;
  }
  const zone = name.match(/z\d+/i)?.[0];
  const title = kind === "pip" ? "PiP" : "Foreground";
  return zone ? `${title} · ${zone}` : `${title} · ${count}`;
}

function clipClass(kind: LayerKind, orphaned = false): string {
  if (orphaned) return "border-(--red) bg-(--red)/20";
  if (kind === "sub") return "border-(--blue) bg-(--blue)/70";
  if (kind === "pip") return "border-(--violet) bg-(--violet)/70";
  if (kind === "bg") return "border-(--amber-2) bg-(--amber-2)/40";
  return "border-(--amber) bg-(--amber)/70";
}

function clipLabel(clip: Pick<TimelineClip, "mediaId" | "sentences">): string {
  if (!clip.sentences) return clip.mediaId;
  const [from, to] = clip.sentences;
  const range = from === to ? `s${from}` : `s${from}-s${to}`;
  return `${clip.mediaId} over ${range}`;
}

function timeFromEvent(event: ReactMouseEvent<HTMLElement>, duration: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : 100;
  return ((event.clientX - rect.left) / width) * duration;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveMediaLabel(item: { mediaId?: string; mediaIds?: string[] }): string {
  if (item.mediaId && item.mediaId.length > 0) return item.mediaId;
  const first = item.mediaIds?.find((entry) => entry.length > 0);
  return first ?? "";
}

function isTimelineItem(item: unknown): item is {
  end: number;
  id: string;
  mediaId?: string;
  mediaIds?: string[];
  orphaned?: boolean;
  sentences?: [number, number];
  start: number;
} {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as {
    end?: unknown;
    id?: unknown;
    start?: unknown;
  };
  return typeof candidate.id === "string" && typeof candidate.start === "number" && typeof candidate.end === "number";
}
