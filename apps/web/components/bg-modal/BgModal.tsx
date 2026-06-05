"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Folder, Trash2, X } from "lucide-react";
import type { BackgroundScheduleSegment } from "@vc/shared-schemas";
import { moveIdRelativeTo, type ReorderPlacement } from "@/lib/media-order";
import { formatBackgroundTime, parseBackgroundTime } from "@/lib/preview/backgroundSchedule";
import { useReorderableAssetMotion } from "@/lib/use-reorderable-asset-motion";

type MediaItem = {
  duration?: number | null;
  filename: string;
  deletable?: boolean;
  import_error?: string | null;
  importing?: boolean;
  kind: "image" | "video";
  mediaId: string;
  thumb_url: string;
};

type BgLayer = {
  id: string;
  kind: "bg";
  name: string;
  items: Array<{
    id: string;
    mediaId?: string;
    mediaIds?: string[];
    sentences: [number, number];
    start: number;
    end: number;
    motion: { kind: string; easing: string };
    transitions: { in: string; out: string };
    crossfade: number;
    schedule?: BackgroundScheduleSegment[];
    cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
  }>;
};

type Props = {
  existing?: BgLayer;
  media: MediaItem[];
  onClose: () => void;
  onDeleteMedia?: (mediaId: string) => void;
  onImport: (files: FileList | null) => Promise<unknown> | unknown;
  onReorderMedia?: (mediaIds: string[]) => void;
  duration: number;
  onSave: (layer: BgLayer) => void;
  open: boolean;
  totalSentences: number;
};

const MOTION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "ken_burns", label: "Ken Burns · subtle" },
  { value: "ken_burns_strong", label: "Ken Burns · strong" },
];

const EASING_OPTIONS = [
  { value: "linear", label: "linear" },
  { value: "ease_in", label: "ease_in" },
  { value: "ease_out", label: "ease_out" },
];

function normalizeMotionKind(value: string | undefined): string {
  if (!value) return "none";
  if (value === "ken_burns_subtle") return "ken_burns";
  return value;
}

function initialState(existing?: BgLayer) {
  const existingItem = existing?.items[0];
  const selectedMedia = existingSelection(existing);
  return {
    crossfadeInput: String(existingItem?.crossfade ?? 0),
    easing: existingItem?.motion?.easing ?? "linear",
    motionKind: normalizeMotionKind(existingItem?.motion?.kind),
    schedule: existingItem?.schedule ?? [],
    scheduleDirty: false,
    scheduleExplicit: Array.isArray(existingItem?.schedule),
    selectedMedia,
  };
}

function existingSelection(existing?: BgLayer): string[] {
  const existingItem = existing?.items[0];
  if (existingItem?.mediaIds && existingItem.mediaIds.length > 0) {
    return existingItem.mediaIds.filter(Boolean);
  }
  return existing?.items.map((item) => item.mediaId).filter((id): id is string => !!id) ?? [];
}

function sameOrderedList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameSchedule(left: BackgroundScheduleSegment[] | undefined, right: BackgroundScheduleSegment[] | undefined): boolean {
  const leftSchedule = left ?? [];
  const rightSchedule = right ?? [];
  return leftSchedule.length === rightSchedule.length && leftSchedule.every((segment, index) => {
    const other = rightSchedule[index];
    if (!other) return false;
    return (
      segment.id === other.id &&
      segment.mediaId === other.mediaId &&
      segment.start === other.start &&
      segment.end === other.end &&
      segment.lockedDuration === other.lockedDuration
    );
  });
}

function isBackgroundPlaylistUnchanged(
  existing: BgLayer | undefined,
  selectedMedia: string[],
  motionKind: string,
  easing: string,
  crossfade: number,
  duration: number,
  totalSentences: number,
  nextSchedule: BackgroundScheduleSegment[] | null,
): boolean {
  const existingItem = existing?.items[0];
  if (
    !existing ||
    existing.items.length !== 1 ||
    !existingItem ||
    !Number.isFinite(crossfade)
  ) {
    return false;
  }
  const fullRangeEnd = Math.max(totalSentences, 1);
  return (
    sameOrderedList(existingSelection(existing), selectedMedia) &&
    normalizeMotionKind(existingItem.motion?.kind) === motionKind &&
    existingItem.motion?.easing === easing &&
    existingItem.crossfade === crossfade &&
    existingItem.start === 0 &&
    existingItem.end === duration &&
    existingItem.sentences[0] === 1 &&
    existingItem.sentences[1] === fullRangeEnd &&
    existingItem.transitions.in === "cut" &&
    existingItem.transitions.out === "cut" &&
    (nextSchedule === null || sameSchedule(existingItem.schedule, nextSchedule))
  );
}

function hasBackgroundItemChanged(
  previous: BgLayer["items"][number],
  next: BgLayer["items"][number],
): boolean {
  return (
    !sameOrderedList(backgroundMediaIds(previous), backgroundMediaIds(next)) ||
    previous.sentences[0] !== next.sentences[0] ||
    previous.sentences[1] !== next.sentences[1] ||
    previous.start !== next.start ||
    previous.end !== next.end ||
    previous.motion.kind !== next.motion.kind ||
    previous.motion.easing !== next.motion.easing ||
    previous.transitions.in !== next.transitions.in ||
    previous.transitions.out !== next.transitions.out ||
    previous.crossfade !== next.crossfade ||
    !sameSchedule(previous.schedule, next.schedule)
  );
}

function backgroundMediaIds(item: BgLayer["items"][number]): string[] {
  if (item.mediaIds && item.mediaIds.length > 0) {
    return item.mediaIds.filter(Boolean);
  }
  return item.mediaId ? [item.mediaId] : [];
}

function isFailedPendingUpload(item: MediaItem): boolean {
  return item.mediaId.startsWith("pending:") && Boolean(item.import_error);
}

function mediaMapFromList(media: MediaItem[]): Map<string, MediaItem> {
  return new Map(media.map((entry) => [entry.mediaId, entry]));
}

function buildManualSchedule(
  mediaIds: string[],
  mediaById: ReadonlyMap<string, MediaItem>,
  previousSchedule: BackgroundScheduleSegment[] | undefined,
): BackgroundScheduleSegment[] {
  const previousById = new Map((previousSchedule ?? []).map((segment) => [segment.mediaId, segment]));
  return mediaIds
    .map((mediaId) => mediaById.get(mediaId))
    .filter((entry): entry is MediaItem => Boolean(entry))
    .map((asset) => {
      const previous = previousById.get(asset.mediaId);
      if (previous) return sanitizeManualSegment(previous);
      return {
        id: `seg-${asset.mediaId}`,
        mediaId: asset.mediaId,
        start: 0,
        end: 0,
        lockedDuration: lockedVideoDuration(asset) !== null,
      };
    });
}

function sanitizeManualSegment(segment: BackgroundScheduleSegment): BackgroundScheduleSegment {
  const start = Math.max(0, segment.start);
  return {
    ...segment,
    start,
    end: Math.max(start, segment.end),
  };
}

function updateManualScheduleField(
  schedule: BackgroundScheduleSegment[],
  mediaById: ReadonlyMap<string, MediaItem>,
  duration: number,
  mediaId: string,
  field: "end" | "hold" | "start",
  seconds: number,
): BackgroundScheduleSegment[] {
  return schedule.map((segment) => {
    if (segment.mediaId !== mediaId) return segment;
    const asset = mediaById.get(segment.mediaId);
    const lockedDuration = lockedVideoDuration(asset);
    if (lockedDuration !== null) {
      if (field !== "start") return segment;
      const start = Math.min(Math.max(0, seconds), Math.max(0, duration));
      return {
        ...segment,
        start,
        end: Math.min(Math.max(0, duration), start + lockedDuration),
        lockedDuration: true,
      };
    }
    if (field === "start") {
      const start = Math.max(0, seconds);
      return { ...segment, start, end: Math.max(start, segment.end) };
    }
    if (field === "end") {
      return { ...segment, end: Math.max(segment.start, seconds) };
    }
    return { ...segment, end: segment.start + Math.max(0, seconds) };
  });
}

function lockedVideoDuration(asset: MediaItem | undefined): number | null {
  return asset?.kind === "video" && typeof asset.duration === "number" && Number.isFinite(asset.duration) && asset.duration > 0
    ? asset.duration
    : null;
}

function withBackgroundCacheStatus(
  previous: BgLayer["items"][number] | undefined,
  next: BgLayer["items"][number],
): BgLayer["items"][number] {
  if (!previous) return next;
  if (hasBackgroundItemChanged(previous, next)) return { ...next, cache_status: "invalid" };
  return previous.cache_status ? { ...next, cache_status: previous.cache_status } : next;
}

export function BgModal({
  duration,
  existing,
  media,
  onClose,
  onDeleteMedia,
  onImport,
  onReorderMedia,
  onSave,
  open,
  totalSentences,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState(() => initialState(existing));

  const isEdit = !!existing;
  const crossfade = Number.parseFloat(state.crossfadeInput);
  const isCrossfadeValid = Number.isFinite(crossfade) && crossfade >= 0 && crossfade <= 2;
  const availableMedia = useMemo(() => media.filter((entry) => !isFailedPendingUpload(entry)), [media]);
  const mediaById = useMemo(() => mediaMapFromList(availableMedia), [availableMedia]);
  const selectedMedia = useMemo(
    () => state.selectedMedia.filter((id) => mediaById.has(id)),
    [mediaById, state.selectedMedia],
  );
  const selectedAssets = useMemo(
    () => selectedMedia.map((id) => mediaById.get(id)).filter((entry): entry is MediaItem => !!entry),
    [mediaById, selectedMedia],
  );
  const coverageSchedule = useMemo(
    () => buildManualSchedule(selectedMedia, mediaById, state.schedule),
    [mediaById, selectedMedia, state.schedule],
  );
  const visibleMedia = useMemo(() => {
    if (selectedMedia.length <= 1) return availableMedia;
    const selectedSet = new Set(selectedMedia);
    const orderedSelected = selectedMedia
      .map((id) => mediaById.get(id))
      .filter((entry): entry is MediaItem => Boolean(entry));
    const unselected = availableMedia.filter((entry) => !selectedSet.has(entry.mediaId));
    return [...orderedSelected, ...unselected];
  }, [availableMedia, mediaById, selectedMedia]);
  const coverageReorderMotion = useReorderableAssetMotion(selectedMedia, reorderCoverageMedia, "y");

  useEffect(() => {
    if (!open) return;
    setState(initialState(existing));
  }, [existing, open]);

  useEffect(() => {
    if (!open) return;
    setState((current) => {
      const nextSelected = current.selectedMedia.filter((id) => mediaById.has(id));
      return sameOrderedList(current.selectedMedia, nextSelected)
        ? current
        : {
            ...current,
            schedule: buildManualSchedule(nextSelected, mediaById, current.schedule),
            selectedMedia: nextSelected,
          };
    });
  }, [mediaById, open]);

  function buildPlaylistItem(selectedMedia: string[], crossfadeSeconds: number, schedule: BackgroundScheduleSegment[] | undefined): BgLayer["items"][number] {
    const existingItem = existing?.items[0];
    const nextItem = {
      id: existingItem?.id ?? `bg-${Date.now()}`,
      mediaIds: selectedMedia,
      sentences: [1, Math.max(totalSentences, 1)] as [number, number],
      start: 0,
      end: duration,
      motion: { kind: state.motionKind, easing: state.easing },
      transitions: { in: "cut", out: "cut" },
      crossfade: crossfadeSeconds,
    } as BgLayer["items"][number];
    if (schedule) nextItem.schedule = schedule;
    return withBackgroundCacheStatus(existingItem, nextItem);
  }

  function handleSave() {
    if (selectedMedia.length === 0 || !isCrossfadeValid) return;
    const nextSchedule = buildManualSchedule(selectedMedia, mediaById, coverageSchedule);
    const includeSchedule = state.scheduleDirty || state.scheduleExplicit;
    const scheduleForUnchangedCheck = includeSchedule ? nextSchedule : null;
    if (existing && isBackgroundPlaylistUnchanged(existing, selectedMedia, state.motionKind, state.easing, crossfade, duration, totalSentences, scheduleForUnchangedCheck)) {
      onSave(existing);
      onClose();
      return;
    }
    const nextItems = [buildPlaylistItem(selectedMedia, crossfade, includeSchedule ? nextSchedule : undefined)];
    if (nextItems.length === 0) return;
    const layer: BgLayer = {
      id: existing?.id ?? "bg-main",
      kind: "bg",
      name: "Background",
      items: nextItems,
    };
    onSave(layer);
    onClose();
  }

  function toggleMedia(mediaId: string) {
    setState((current) => {
      const mediaItem = mediaById.get(mediaId);
      if (!mediaItem) return current;
      const selected = current.selectedMedia;
      let nextSelectedMedia: string[];
      if (selected.includes(mediaId)) {
        if (selected.length <= 1) return current;
        nextSelectedMedia = selected.filter((item) => item !== mediaId);
      } else {
        nextSelectedMedia = [...selected, mediaId];
      }
      return {
        ...current,
        schedule: buildManualSchedule(nextSelectedMedia, mediaById, current.schedule),
        scheduleDirty: true,
        selectedMedia: nextSelectedMedia,
      };
    });
  }

  function updateCoverageField(mediaId: string, field: "end" | "hold" | "start", value: string) {
    const seconds = parseBackgroundTime(value);
    if (seconds === null) return;
    setState((current) => {
      const currentSchedule = buildManualSchedule(current.selectedMedia, mediaById, current.schedule);
      return {
        ...current,
        schedule: updateManualScheduleField(currentSchedule, mediaById, duration, mediaId, field, seconds),
        scheduleDirty: true,
      };
    });
  }

  function extendCoverageToEnd(mediaId: string) {
    setState((current) => {
      const currentSchedule = buildManualSchedule(current.selectedMedia, mediaById, current.schedule);
      return {
        ...current,
        schedule: updateManualScheduleField(currentSchedule, mediaById, duration, mediaId, "end", duration),
        scheduleDirty: true,
      };
    });
  }

  function reorderCoverageMedia(sourceId: string, targetId: string, placement: ReorderPlacement) {
    const nextSelectedMedia = moveIdRelativeTo(selectedMedia, sourceId, targetId, placement);
    if (sameOrderedList(selectedMedia, nextSelectedMedia)) return;
    const selectedSet = new Set(nextSelectedMedia);
    onReorderMedia?.([
      ...nextSelectedMedia,
      ...availableMedia.map((item) => item.mediaId).filter((id) => !selectedSet.has(id)),
    ]);
    setState((current) => ({
      ...current,
      schedule: buildManualSchedule(nextSelectedMedia, mediaById, current.schedule),
      scheduleDirty: true,
      selectedMedia: nextSelectedMedia,
    }));
  }

  if (!open) return null;

  return (
    <Dialog.Root onOpenChange={(next) => { if (!next) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(720px,calc(100vh-40px))] max-h-[calc(100vh-40px)] w-[min(900px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-(--line) bg-(--bg-1) text-(--text) shadow-[0_30px_80px_rgba(0,0,0,0.55)] max-[860px]:w-[min(640px,calc(100vw-28px))]">
          <header className="flex min-h-[84px] items-start gap-3 border-b border-(--line-soft) px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[18px] font-semibold leading-[27px] tracking-normal">
                {isEdit ? "Change background" : "Add background"}
              </Dialog.Title>
              <Dialog.Description className="mt-0 max-w-[420px] text-[13px] leading-[19.5px] text-(--text-3)">
                Build a timed background plan from images and footage.
              </Dialog.Description>
            </div>
            <button aria-label="Close" className="rounded p-1 text-(--text-3) hover:text-(--text)" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_minmax(0,1fr)] gap-5 overflow-hidden px-6 py-5 max-[860px]:grid-cols-1 max-[860px]:overflow-auto">
            <section className="flex min-h-0 min-w-0 flex-col gap-[18px]">
              <div>
                <div className="mb-[11px] flex min-h-[30px] items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <p className="text-[11px] font-semibold uppercase leading-[16.5px] tracking-[0.02em] text-(--text-3)">Assets</p>
                    <span className="font-mono text-[11px] font-medium leading-4 text-(--text-3)" data-testid="background-selected-count">
                      {selectedMedia.length} selected
                    </span>
                  </div>
                  <button
                    className="inline-flex min-h-[30px] items-center gap-2 rounded border border-(--line) bg-(--bg-2) px-2.5 text-xs font-semibold leading-4 text-(--text-2) hover:bg-(--bg-3)"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Folder aria-hidden="true" className="h-3.5 w-3.5" />
                    Import from disk...
                  </button>
                </div>
            <input
              aria-label="Import from disk"
              className="hidden"
              multiple
              onChange={(event) => {
                void onImport(event.target.files);
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            {availableMedia.length === 0 ? (
              <p className="text-sm text-(--text-3)">No media added yet.</p>
            ) : (
              <div
                className="grid max-h-[310px] min-h-0 grid-cols-2 gap-2 overflow-y-auto pr-1"
                data-asset-count={visibleMedia.length}
                data-reorder-rail="true"
                data-testid="background-asset-grid"
              >
                {visibleMedia.map((item) => {
                  const active = selectedMedia.includes(item.mediaId);
                  const hasError = Boolean(item.import_error);
                  return (
                    <div
                      className="relative h-[95px] min-w-0"
                      data-media-id={item.mediaId}
                      key={item.mediaId}
                    >
                      <button
                        aria-label={`${item.filename}${active ? " selected" : ""}`}
                        aria-pressed={active}
                        className={`relative flex h-full w-full flex-col gap-1.5 overflow-hidden rounded-md border p-1 text-left transition-colors ${
                          active
                            ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                            : hasError
                              ? "border-(--red) bg-(--bg-2)"
                              : "border-(--line) bg-(--bg-2) hover:bg-(--bg-3)"
                        }`}
                        onClick={() => toggleMedia(item.mediaId)}
                        type="button"
                      >
                        <div className="relative h-[61px] overflow-hidden rounded-sm bg-(--bg-3)">
                          {item.thumb_url ? (
                            <img
                              alt={item.filename}
                              className="h-full w-full object-cover"
                              src={`/api/server${item.thumb_url}`}
                            />
                          ) : (
                            <div className="h-full w-full bg-[linear-gradient(135deg,oklch(0.34_0.07_270),oklch(0.48_0.12_55))]" />
                          )}
                          <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white">
                            {item.kind === "video" ? "MP4" : "IMG"}
                          </span>
                          {active ? (
                            <span className="absolute bottom-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-(--amber) text-(--bg-0)">
                              <Check aria-hidden="true" className="h-3 w-3" />
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 truncate text-[11px] font-semibold leading-[14px] text-(--text)" title={item.filename}>
                          {item.filename}
                        </div>
                        {item.import_error ? (
                          <div className="truncate font-mono text-[10px] text-(--red)">{item.import_error}</div>
                        ) : null}
                        <span className="sr-only">{item.filename}</span>
                      </button>
                      {item.deletable && onDeleteMedia ? (
                        <button
                          aria-label={`Delete ${item.filename}`}
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded bg-black/65 text-white transition hover:bg-(--red) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--amber)"
                          data-reorder-delete="true"
                          onClick={() => onDeleteMedia(item.mediaId)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
              </div>

          <section className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase leading-[14.3px] tracking-[0.02em] text-(--text-3)">
                Motion
              </span>
              <select
                className="rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-sm text-(--text)"
                onChange={(event) => setState((current) => ({ ...current, motionKind: event.target.value }))}
                value={state.motionKind}
              >
                {MOTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase leading-[14.3px] tracking-[0.02em] text-(--text-3)">
                Easing
              </span>
              <select
                className="rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-sm text-(--text)"
                onChange={(event) => setState((current) => ({ ...current, easing: event.target.value }))}
                value={state.easing}
              >
                {EASING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section>
            <label className="mb-2 block text-[11px] font-semibold uppercase leading-[14.3px] tracking-[0.02em] text-(--text-3)" htmlFor="background-crossfade">
              Crossfade between cycles
            </label>
            <div className="flex items-center gap-3">
              <input
                aria-label="Crossfade between cycles"
                className="h-2 min-w-0 flex-1 accent-(--amber)"
                id="background-crossfade"
                max={2}
                min={0}
                onChange={(event) => setState((current) => ({ ...current, crossfadeInput: event.target.value }))}
                step={0.1}
                type="range"
                value={state.crossfadeInput}
              />
              <span className="w-10 text-right font-mono text-[12px] text-(--text-2)">
                {Number.isFinite(crossfade) ? `${crossfade.toFixed(1)}s` : `${state.crossfadeInput}s`}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-(--text-3)">
              When the background image cycles to the next asset in the playlist, this is how long the crossfade takes.
            </p>
          </section>
          {!isCrossfadeValid ? (
            <p className="rounded border border-(--red)/40 bg-(--red)/10 px-3 py-2 text-sm text-(--red)" role="alert">
              Crossfade must be between 0 and 2 seconds.
            </p>
          ) : null}
            </section>

            <section className="flex min-h-0 min-w-0 flex-col gap-[14px] max-[860px]:min-h-[360px]">
              <div className="flex min-h-[34px] items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-[18px] text-(--text)">Coverage plan</p>
                  <p className="mt-0.5 font-mono text-[11px] text-(--text-3)">
                    {selectedAssets.filter((asset) => asset.kind === "image").length} image ranges / {coverageSchedule.length} total / drag rows to reorder
                  </p>
                </div>
              </div>

              <div
                aria-label="Background coverage"
                className="flex min-h-0 flex-col gap-2 overflow-auto pr-0.5"
                data-row-count={selectedAssets.length}
                data-testid="background-coverage-grid"
              >
                {selectedAssets.map((asset) => {
                  const segment = coverageSchedule.find((entry) => entry.mediaId === asset.mediaId);
                  if (!segment) return null;
                  const isVideo = asset.kind === "video";
                  const nativeVideoDuration = lockedVideoDuration(asset);
                  const locked = nativeVideoDuration !== null;
                  const hold = Math.max(0, segment.end - segment.start);
                  return (
                    <div
                      aria-label={`Coverage row ${asset.filename}`}
                      className={`grid min-h-[76px] min-w-0 cursor-grab grid-cols-[46px_minmax(0,1fr)] items-center gap-[9px] rounded-[7px] border bg-(--bg-2) p-2 will-change-transform active:cursor-grabbing ${
                        isVideo ? "border-[rgba(96,165,250,0.34)]" : "border-[rgba(245,158,11,0.32)]"
                      }`}
                      data-media-id={asset.mediaId}
                      data-reorder-card="true"
                      data-testid={`background-coverage-row-${asset.mediaId}`}
                      key={asset.mediaId}
                      ref={(node) => coverageReorderMotion.registerNode(asset.mediaId, node)}
                      onClickCapture={coverageReorderMotion.suppressClickAfterDrag}
                      onPointerCancel={coverageReorderMotion.cancelPointerDrag}
                      onPointerDown={(event) => coverageReorderMotion.beginPointerDrag(asset.mediaId, event)}
                      onPointerMove={coverageReorderMotion.movePointerDrag}
                      onPointerUp={coverageReorderMotion.endPointerDrag}
                    >
                      <div className="relative h-[38px] w-[46px] overflow-hidden rounded bg-(--bg-3) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
                        {asset.thumb_url ? (
                          <img alt="" aria-hidden="true" className="h-full w-full object-cover" src={`/api/server${asset.thumb_url}`} />
                        ) : (
                          <div className="h-full w-full bg-[linear-gradient(135deg,oklch(0.34_0.07_270),oklch(0.48_0.12_55))]" />
                        )}
                        <span className="absolute left-1 top-1 rounded bg-black/65 px-[5px] py-px font-mono text-[9px] font-semibold leading-3 text-white">
                          {isVideo ? "MP4" : "IMG"}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-[7px]">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <strong
                            className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-4 text-(--text)"
                            data-testid={`background-coverage-name-${asset.mediaId}`}
                            title={asset.filename}
                          >
                            {asset.filename}
                          </strong>
                          <span className="inline-flex min-w-max items-center gap-2">
                            <em className="font-mono text-[10px] not-italic text-(--text-3)">
                              {isVideo && nativeVideoDuration !== null
                                ? `native ${formatBackgroundTime(nativeVideoDuration)}`
                                : `${formatBackgroundTime(segment.start)}-${formatBackgroundTime(segment.end)}`}
                            </em>
                            {!isVideo ? (
                              <button
                                className="inline-flex h-6 min-w-14 items-center justify-center rounded border border-transparent bg-transparent px-[7px] text-[11px] font-semibold text-(--text-2) hover:bg-(--bg-3)"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  extendCoverageToEnd(asset.mediaId);
                                }}
                                type="button"
                              >
                                Extend
                              </button>
                            ) : null}
                          </span>
                        </div>
                        <div className="grid grid-cols-[repeat(3,minmax(74px,1fr))] gap-[7px]">
                          <TimeField
                            disabled={false}
                            label="Start"
                            name={asset.filename}
                            onChange={(value) => updateCoverageField(asset.mediaId, "start", value)}
                            value={formatBackgroundTime(segment.start)}
                          />
                          <TimeField
                            disabled={locked}
                            label="End"
                            name={asset.filename}
                            onChange={(value) => updateCoverageField(asset.mediaId, "end", value)}
                            value={formatBackgroundTime(segment.end)}
                          />
                          <TimeField
                            disabled={locked}
                            label="Hold"
                            name={asset.filename}
                            onChange={(value) => updateCoverageField(asset.mediaId, "hold", value)}
                            value={formatBackgroundTime(hold)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <footer className="flex min-h-[65px] justify-end gap-3 border-t border-(--line-soft) bg-(--bg-2) px-6 py-4">
            <button
              className="min-h-8 rounded px-4 text-sm font-semibold leading-5 text-(--text-2) hover:text-(--text)"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="min-h-8 min-w-[127px] rounded bg-(--text) px-4 text-sm font-semibold leading-5 text-(--bg-0) disabled:opacity-40"
              disabled={selectedMedia.length === 0 || !isCrossfadeValid}
              onClick={handleSave}
              type="button"
            >
              {isEdit ? "Save changes" : "Add background"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TimeField({
  disabled,
  label,
  name,
  onChange,
  value,
}: {
  disabled: boolean;
  label: "End" | "Hold" | "Start";
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-[5px] whitespace-nowrap text-[10px] leading-3 text-(--text-3)">
      <span>{label}</span>
      <input
        aria-label={`${label} ${name}`}
        className="h-6 min-w-0 rounded border border-(--line) bg-(--bg-1) px-[5px] font-mono text-[10.5px] leading-3 text-(--text) disabled:opacity-[0.54]"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        title="Use mm:ss, hh:mm:ss, or seconds"
        type="text"
        value={value}
      />
    </label>
  );
}
