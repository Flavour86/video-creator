"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Folder, Trash2, X } from "lucide-react";
import { moveIdRelativeTo, type ReorderPlacement } from "@/lib/media-order";
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

function isBackgroundPlaylistUnchanged(
  existing: BgLayer | undefined,
  selectedMedia: string[],
  motionKind: string,
  easing: string,
  crossfade: number,
  duration: number,
  totalSentences: number,
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
    existingItem.transitions.out === "cut"
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
    previous.crossfade !== next.crossfade
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
  const reorderMotion = useReorderableAssetMotion(availableMedia.map((entry) => entry.mediaId), reorderMedia);
  const mediaById = useMemo(() => new Map(availableMedia.map((entry) => [entry.mediaId, entry])), [availableMedia]);
  const selectedMedia = useMemo(
    () => state.selectedMedia.filter((id) => mediaById.has(id)),
    [mediaById, state.selectedMedia],
  );
  const selectedAssets = useMemo(
    () => selectedMedia.map((id) => mediaById.get(id)).filter((entry): entry is MediaItem => !!entry),
    [mediaById, selectedMedia],
  );
  const lockedKind = selectedAssets[0]?.kind ?? null;
  const selectedLabel = lockedKind === "video" ? "clips only" : lockedKind === "image" ? "images only" : "select media";

  useEffect(() => {
    if (!open) return;
    setState(initialState(existing));
  }, [existing, open]);

  useEffect(() => {
    if (!open) return;
    setState((current) => {
      const nextSelected = current.selectedMedia.filter((id) => mediaById.has(id));
      return sameOrderedList(current.selectedMedia, nextSelected) ? current : { ...current, selectedMedia: nextSelected };
    });
  }, [mediaById, open]);

  function buildPlaylistItem(selectedMedia: string[], crossfadeSeconds: number): BgLayer["items"][number] {
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
    return withBackgroundCacheStatus(existingItem, nextItem);
  }

  function handleSave() {
    if (selectedMedia.length === 0 || !isCrossfadeValid) return;
    if (existing && isBackgroundPlaylistUnchanged(existing, selectedMedia, state.motionKind, state.easing, crossfade, duration, totalSentences)) {
      onSave(existing);
      onClose();
      return;
    }
    const selectedKind = lockedKind ?? mediaById.get(selectedMedia[0] ?? "")?.kind;
    if (!selectedKind) return;
    const nextItems = [buildPlaylistItem(selectedMedia, crossfade)];
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
      const selectedAssets = selected.map((id) => mediaById.get(id)).filter((entry): entry is MediaItem => !!entry);
      const currentKind = selectedAssets[0]?.kind ?? null;
      if (selected.includes(mediaId)) {
        if (selected.length <= 1) return current;
        return { ...current, selectedMedia: selected.filter((item) => item !== mediaId) };
      }
      if (currentKind && currentKind !== mediaItem.kind) {
        return { ...current, selectedMedia: [mediaId] };
      }
      return { ...current, selectedMedia: [...selected, mediaId] };
    });
  }

  function reorderMedia(sourceId: string, targetId: string, placement: ReorderPlacement) {
    const currentOrder = availableMedia.map((item) => item.mediaId);
    const nextOrder = moveIdRelativeTo(currentOrder, sourceId, targetId, placement);
    if (sameOrderedList(currentOrder, nextOrder)) return;
    onReorderMedia?.(nextOrder);
    setState((current) => {
      const selected = new Set(current.selectedMedia);
      const nextSelectedMedia = nextOrder.filter((id) => selected.has(id));
      return sameOrderedList(current.selectedMedia, nextSelectedMedia)
        ? current
        : { ...current, selectedMedia: nextSelectedMedia };
    });
  }

  if (!open) return null;

  return (
    <Dialog.Root onOpenChange={(next) => { if (!next) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-(--line) bg-(--bg-1) text-(--text) shadow-(--shadow-2)">
          <header className="flex items-start gap-4 border-b border-(--line-soft) px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[18px] font-semibold tracking-normal">
                {isEdit ? "Change background" : "Add background"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-(--text-3)">
                The background spans the entire video and shows whenever no foreground is active.
              </Dialog.Description>
            </div>
            <button aria-label="Close" className="rounded p-1 text-(--text-3) hover:text-(--text)" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">Assets</p>
                  <span className="font-mono text-[11px] text-(--text-3)">
                    {selectedMedia.length} selected · {selectedLabel}
                  </span>
                </div>
              <button
                className="inline-flex items-center gap-2 rounded border border-(--line) bg-(--bg-2) px-2.5 py-1.5 text-xs font-semibold text-(--text-2) hover:bg-(--bg-3)"
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
              <div className="flex max-h-[260px] gap-2 overflow-x-auto overflow-y-hidden pb-1" data-reorder-rail="true">
                {availableMedia.map((item) => {
                  const active = selectedMedia.includes(item.mediaId);
                  const hasError = Boolean(item.import_error);
                  return (
                    <div
                      className="relative w-[118px] shrink-0 cursor-grab will-change-transform active:cursor-grabbing"
                      data-media-id={item.mediaId}
                      data-reorder-card="true"
                      key={item.mediaId}
                      ref={(node) => reorderMotion.registerNode(item.mediaId, node)}
                      onClickCapture={reorderMotion.suppressClickAfterDrag}
                      onPointerCancel={reorderMotion.cancelPointerDrag}
                      onPointerDown={(event) => {
                        if (hasError) return;
                        reorderMotion.beginPointerDrag(item.mediaId, event);
                      }}
                      onPointerMove={reorderMotion.movePointerDrag}
                      onPointerUp={reorderMotion.endPointerDrag}
                    >
                      <button
                        aria-label={`${item.filename}${active ? " selected" : ""}`}
                        aria-pressed={active}
                        className={`relative w-full overflow-hidden rounded-md border p-1 text-left transition-colors ${
                          active
                            ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                            : hasError
                              ? "border-(--red) bg-(--bg-2)"
                              : "border-(--line) bg-(--bg-2) hover:bg-(--bg-3)"
                        }`}
                        onClick={() => toggleMedia(item.mediaId)}
                        type="button"
                      >
                        <div className="relative aspect-video overflow-hidden rounded-sm bg-(--bg-3)">
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
                        <div className="mt-1.5 truncate text-[12px] text-(--text)">{item.filename}</div>
                        {item.import_error ? (
                          <div className="truncate font-mono text-[10px] text-(--red)">{item.import_error}</div>
                        ) : null}
                        {!active && lockedKind && item.kind !== lockedKind ? (
                          <span className="pointer-events-none absolute inset-x-2 bottom-7 rounded bg-(--amber-bg) px-1 py-0.5 text-center text-[10px] font-semibold text-(--amber)">
                            Will replace
                          </span>
                        ) : null}
                        <span className="sr-only">{item.filename}</span>
                      </button>
                      {item.deletable && onDeleteMedia ? (
                        <button
                          aria-label={`Delete ${item.filename}`}
                          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded bg-black/65 text-white transition hover:bg-(--red) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--amber)"
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
              {selectedMedia.length > 1 ? (
                <p className="mt-2 text-[12px] text-(--text-3)">
                  {lockedKind === "video"
                    ? `${selectedMedia.length} clips stay in one background timeline item and play in sequence during render.`
                    : `${selectedMedia.length} images stay in one background timeline item and cycle during render.`}{" "}
                  The selected card order is used in the inspector.
                </p>
              ) : null}
            </section>

          <section className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">
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
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)" htmlFor="background-crossfade">
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
          </div>

          <footer className="flex justify-end gap-3 border-t border-(--line-soft) bg-(--bg-2) px-6 py-4">
            <button
              className="rounded px-3 py-1.5 text-sm text-(--text-2) hover:text-(--text)"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded bg-(--text) px-4 py-1.5 text-sm font-semibold text-(--bg-0) disabled:opacity-40"
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
