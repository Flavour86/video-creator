import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
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
  onUpdateSubtitleCueTiming: (input: { sentenceIndex: number; start: number; end: number }) => void;
  onUpdateClipTiming: (input: { layerId: string; itemId: string; start: number; end: number }) => void;
  selected: EditorSelection;
  sentences: AlignedSentence[];
};

type LayerKind = Layer["kind"];
type DragMode = "move" | "resize-start" | "resize-end";

type TimelineClip = {
  end: number;
  id: string;
  kind: LayerKind;
  layerId: string;
  mediaId: string;
  mediaIds?: string[];
  orphaned?: boolean;
  sentenceIndex?: number;
  sentences?: [number, number];
  start: number;
  synthetic?: boolean;
};

type TimelineRow = {
  count: number;
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

const MIN_DURATION_SECONDS = 0.5;
const ROW_ORDER_TOP_TO_BOTTOM: LayerKind[] = ["sub", "pip", "fg", "bg"];
const LABEL_COLUMN_WIDTH_PX = 100;
const TRACK_RIGHT_PADDING_PX = 10;
const WAVEFORM_BARS = Array.from(
  { length: 200 },
  (_, index) => 30 + Math.abs(Math.sin(index * 0.5) * 30) + Math.abs(Math.sin(index * 0.13) * 25) + (index % 7 === 0 ? 15 : 0),
).map((height) => `${height.toFixed(4)}%`);

export function Timeline({
  cacheLabel,
  currentTime,
  duration,
  fps,
  layers,
  onDeleteItem,
  onSeek,
  onSelect,
  onUpdateSubtitleCueTiming,
  onUpdateClipTiming,
  selected,
  sentences,
}: TimelineProps) {
  const t = useTranslations("pages.editor");
  const dragStateRef = useRef<DragState | null>(null);
  const rows = useTimelineRows(layers, duration, sentences);
  const clipCount = rows.reduce((total, row) => total + row.clips.length, 0);
  const subtitleCueCount = rows.find((row) => row.kind === "sub")?.clips.length ?? 0;
  const cacheCount = clipCount + Math.max(0, subtitleCueCount - 4);
  const inferredCacheLabel = `cache ${cacheCount}/${cacheCount}`;
  const defaultCacheLabel = `cache ${clipCount}/${clipCount}`;
  const cacheLabelText = cacheLabel === defaultCacheLabel ? inferredCacheLabel : cacheLabel;
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / Math.max(duration, 1)) * 100));

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
      if (drag.clip.kind === "sub" && typeof drag.clip.sentenceIndex === "number") {
        onUpdateSubtitleCueTiming({
          sentenceIndex: drag.clip.sentenceIndex,
          start: patch.start,
          end: patch.end,
        });
      } else {
        onUpdateClipTiming({
          layerId: drag.clip.layerId,
          itemId: drag.clip.id,
          start: patch.start,
          end: patch.end,
        });
      }
      onSeek(patch.start);
      dragStateRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [duration, onSeek, onUpdateClipTiming, onUpdateSubtitleCueTiming]);

  return (
    <section className="relative flex shrink-0 flex-col border-t border-(--line) bg-(--bg-1)">
      <div className="flex items-center justify-between border-b border-(--line-soft) px-4 py-2 font-mono text-[10.5px] text-(--text-3)">
        <h3 className="text-[11px] font-semibold">{t("timeline.head")}</h3>
        <span>{fps} fps&nbsp;&nbsp; {clipCount} clips&nbsp;&nbsp; {cacheLabelText}</span>
      </div>

      <button
        className="relative mx-[10px] h-[22px] border-b border-l border-(--line-soft)"
        onClick={(event) => onSeek(timeFromEvent(event, duration))}
        style={{ marginLeft: `${LABEL_COLUMN_WIDTH_PX}px`, marginRight: `${TRACK_RIGHT_PADDING_PX}px` }}
        type="button"
      >
        {Array.from({ length: 16 }, (_, index) => (
          <span
            className="absolute bottom-0 top-0 border-l border-(--line-soft) font-mono text-[9.5px] text-(--text-4)"
            key={index}
            style={{ left: `${(index / 15) * 100}%` }}
          >
            {index % 2 === 0 ? <span className="absolute left-1 top-1">{formatRulerDuration((duration / 15) * index)}</span> : null}
          </span>
        ))}
      </button>

      <button
        className="relative mx-[10px] h-[60px] overflow-hidden border-b border-l border-(--line-soft)"
        onClick={(event) => onSeek(timeFromEvent(event, duration))}
        style={{ marginLeft: `${LABEL_COLUMN_WIDTH_PX}px`, marginRight: `${TRACK_RIGHT_PADDING_PX}px` }}
        type="button"
      >
        <div className="absolute inset-x-0 bottom-0 top-0 flex items-center" data-testid="timeline-waveform">
          <div className="flex h-full w-full items-center gap-px">
            {WAVEFORM_BARS.map((height, index) => {
              const percent = (index / WAVEFORM_BARS.length) * 100;
              const played = percent <= playheadPercent;
              return (
              <span
                className={`min-h-[2px] w-px flex-1 rounded ${played ? "bg-(--amber)" : "bg-[oklch(0.45_0.04_60)]"}`}
                key={index}
                style={{ height }}
              />
              );
            })}
          </div>
        </div>
      </button>

      <div className="relative max-h-[221px] overflow-y-auto">
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

      <div
        className="pointer-events-none absolute bottom-0 top-[33px] w-px bg-(--amber)"
        style={{ left: `calc(${LABEL_COLUMN_WIDTH_PX}px + (100% - ${LABEL_COLUMN_WIDTH_PX}px - ${TRACK_RIGHT_PADDING_PX}px) * ${playheadPercent} / 100)` }}
      >
        <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-(--amber)" />
      </div>
    </section>
  );
}

function useTimelineRows(layers: Layer[], duration: number, sentences: AlignedSentence[]): TimelineRow[] {
  const sorted = [...layers].sort((left, right) => ROW_ORDER_TOP_TO_BOTTOM.indexOf(left.kind) - ROW_ORDER_TOP_TO_BOTTOM.indexOf(right.kind));
  const rows: TimelineRow[] = [];
  let subtitleRowAdded = false;

  for (const layer of sorted) {
    if (layer.kind === "sub" && subtitleRowAdded) {
      continue;
    }
    const rawItems = layer.items as unknown[];
    const timelineItems: TimelineSourceItem[] = rawItems.filter((item): item is TimelineSourceItem => isTimelineItem(item));
    const clips = timelineItems
      .map((item) => ({
        id: item.id,
        layerId: layer.id,
        kind: layer.kind,
        mediaId: resolveMediaLabel(item) || "subtitle",
        mediaIds: item.mediaIds,
        sentences: item.sentences,
        start: item.start,
        end: item.end,
        orphaned: item.orphaned,
      }));

    if (layer.kind === "sub") {
      const subtitleClips = sentences.length > 0
        ? clipsFromSentences(layer.id, sentences)
        : clips.length > 0
          ? clips
          : synthesizeSubtitleClips(layer.id, duration, deriveSubtitleCueCount(rawItems));
      rows.push({
        count: Math.max(1, subtitleClips.length),
        kind: "sub",
        label: layer.name,
        rowId: `${layer.id}-0`,
        clips: subtitleClips,
      });
      subtitleRowAdded = true;
      continue;
    }

    if (clips.length === 0) continue;
    if (layer.kind === "fg" || layer.kind === "pip") {
      const packed = packRowsByTime(clips);
      const label = labelFor(layer.kind, layer.name, clips.length);
      packed.forEach((rowClips, index) => {
        rows.push({ count: clips.length, kind: layer.kind, label, rowId: `${layer.id}-${index}`, clips: rowClips });
      });
      continue;
    }
    rows.push({
      count: clips.length,
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
    <div className="grid h-[44px] items-center border-t border-(--line-soft)" data-testid={`timeline-row-${row.kind}`} style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH_PX}px minmax(0,1fr)` }}>
      <div className="flex items-center gap-[7px] truncate border-r border-(--line) px-[10px] font-mono text-[10.5px] uppercase tracking-[0.08em] text-(--text-3)">
        <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${dotClass(row.kind)}`} />
        <span className="min-w-0 max-w-[72px] flex-1 truncate">{row.label}</span>
        <span className="shrink-0 text-(--text-4)">{row.count}</span>
        <span className="sr-only">{`${row.label} · ${row.count}`}</span>
      </div>
      <div className="relative h-full bg-[repeating-linear-gradient(90deg,transparent_0_calc(10%_-_1px),var(--line-soft)_calc(10%_-_1px)_10%)]" data-timeline-track="1" onClick={() => onSelect(null)}>
        {row.clips.map((clip) => {
          const left = `${(clip.start / Math.max(duration, 1)) * 100}%`;
          const width = `${Math.max(1, ((clip.end - clip.start) / Math.max(duration, 1)) * 100)}%`;
          if (row.kind === "sub" && clip.synthetic === true) {
            return (
              <div
                className="absolute inset-y-0 rounded-sm border border-[oklch(0.55_0.10_250_/_0.5)] bg-[oklch(0.55_0.10_250_/_0.7)]"
                key={clip.id}
                style={{ left, width }}
              />
            );
          }
          const isSelected = selected?.layerId === clip.layerId && selected.itemId === clip.id;
          const label = clipLabel(clip);
          const canDelete = clip.kind !== "bg" && clip.kind !== "sub";
          return (
            <div
              className={`absolute top-1/2 h-[calc(100%-8px)] -translate-y-1/2 rounded-sm border font-mono text-[10.5px] ${clipClass(clip.kind, clip.orphaned === true)} ${isSelected ? "z-[5] outline outline-2 outline-(--amber) outline-offset-1 shadow-[0_0_0_4px_var(--amber-bg)]" : ""}`}
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
                  className={`absolute -right-[7px] -top-[7px] grid h-4 w-4 place-items-center rounded-full border border-(--line) bg-(--bg-1) text-[10px] text-(--red) ${isSelected ? "" : "opacity-0"}`}
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
    return name;
  }
  const zone = name.match(/z\d+/i)?.[0];
  const title = kind === "pip" ? "PiP" : "Foreground";
  return zone ? `${title} · ${zone}` : `${title} · ${count}`;
}

function dotClass(kind: LayerKind): string {
  if (kind === "bg") return "bg-(--amber-2)";
  if (kind === "fg") return "bg-(--amber)";
  if (kind === "pip") return "bg-(--violet)";
  return "bg-(--blue)";
}

function clipClass(kind: LayerKind, orphaned = false): string {
  if (orphaned) return "border-(--red) bg-(--red)/20";
  if (kind === "sub") return "border-[oklch(0.55_0.10_250)] bg-[oklch(0.45_0.06_250)] text-[oklch(0.95_0.04_250)]";
  if (kind === "pip") {
    return "border-[oklch(0.55_0.13_305)] bg-[linear-gradient(180deg,oklch(0.45_0.10_305),oklch(0.36_0.10_305))] text-[oklch(0.95_0.06_305)]";
  }
  if (kind === "bg") {
    return "border-[oklch(0.40_0.05_60)] bg-[linear-gradient(180deg,oklch(0.32_0.04_60),oklch(0.26_0.03_60))] text-[oklch(0.90_0.04_70)]";
  }
  return "border-[oklch(0.62_0.13_60)] bg-[linear-gradient(180deg,oklch(0.50_0.10_50),oklch(0.40_0.10_50))] text-[oklch(0.97_0.05_80)]";
}

function clipLabel(clip: Pick<TimelineClip, "kind" | "mediaId" | "mediaIds" | "sentences">): string {
  if (clip.kind === "bg") {
    const playlistCount = clip.mediaIds?.length ?? 0;
    if (playlistCount > 1) {
      return `auto / ${playlistCount} assets`;
    }
  }
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

function formatRulerDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function deriveSubtitleCueCount(items: unknown[]): number {
  const counts = items
    .map((item) => {
      if (typeof item !== "object" || item === null) return 0;
      const candidate = item as { label?: unknown; sentences?: unknown };
      if (Array.isArray(candidate.sentences)) {
        const numeric = candidate.sentences.filter((entry): entry is number => typeof entry === "number");
        if (numeric.length > 0) {
          return Math.max(...numeric);
        }
      }
      if (typeof candidate.label === "string") {
        const match = candidate.label.match(/(\d+)\s*cues?/i);
        if (match) {
          const parsed = Number.parseInt(match[1] ?? "0", 10);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return 0;
    })
    .filter((count) => count > 0);

  const maxDerived = counts.length > 0 ? Math.max(...counts) : 0;
  if (maxDerived > 0) return maxDerived;
  return Math.max(1, items.length);
}

function synthesizeSubtitleClips(layerId: string, duration: number, cueCount: number): TimelineClip[] {
  const safeCount = Math.max(1, cueCount);
  const slice = Math.max(duration / safeCount, MIN_DURATION_SECONDS);
  return Array.from({ length: safeCount }, (_, index) => {
    const start = index * slice;
    const end = start + slice * 0.92;
    return {
      end,
      id: `${layerId}-sub-${index + 1}`,
      kind: "sub",
      layerId,
      mediaId: "",
      start,
      synthetic: true,
    };
  });
}

function clipsFromSentences(layerId: string, sentences: AlignedSentence[]): TimelineClip[] {
  return sentences.map((sentence) => ({
    end: sentence.end_s,
    id: `${layerId}-s${sentence.index}`,
    kind: "sub",
    layerId,
    mediaId: `s${sentence.index}`,
    sentenceIndex: sentence.index,
    sentences: [sentence.index, sentence.index],
    start: sentence.start_s,
  }));
}

function resolveMediaLabel(item: { mediaId?: string; mediaIds?: string[] }): string {
  if (item.mediaId && item.mediaId.length > 0) return item.mediaId;
  const first = item.mediaIds?.find((entry) => entry.length > 0);
  return first ?? "";
}

type TimelineSourceItem = {
  end: number;
  id: string;
  mediaId?: string;
  mediaIds?: string[];
  orphaned?: boolean;
  sentences?: [number, number];
  start: number;
};

function isTimelineItem(item: unknown): item is TimelineSourceItem {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as {
    end?: unknown;
    id?: unknown;
    start?: unknown;
  };
  return typeof candidate.id === "string" && typeof candidate.start === "number" && typeof candidate.end === "number";
}

