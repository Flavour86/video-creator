"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type MediaItem = {
  duration?: number | null;
  filename: string;
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
    mediaId: string;
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
  onImport: (files: FileList | null) => Promise<void> | void;
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
  return {
    crossfadeInput: String(existingItem?.crossfade ?? 0),
    easing: existingItem?.motion.easing ?? "linear",
    motionKind: normalizeMotionKind(existingItem?.motion.kind),
    selectedMedia: existing?.items.map((item) => item.mediaId) ?? [],
  };
}

function hasBackgroundItemChanged(
  previous: BgLayer["items"][number],
  next: BgLayer["items"][number],
): boolean {
  return (
    previous.mediaId !== next.mediaId ||
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
  onImport,
  onSave,
  open,
  totalSentences,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState(() => initialState(existing));

  const isEdit = !!existing;
  const crossfade = Number.parseFloat(state.crossfadeInput);
  const isCrossfadeValid = Number.isFinite(crossfade) && crossfade >= 0 && crossfade <= 2;
  const mediaById = useMemo(() => new Map(media.map((entry) => [entry.mediaId, entry])), [media]);
  const selectedAssets = useMemo(
    () => state.selectedMedia.map((id) => mediaById.get(id)).filter((entry): entry is MediaItem => !!entry),
    [mediaById, state.selectedMedia],
  );
  const lockedKind = selectedAssets[0]?.kind ?? null;
  const selectedLabel = lockedKind === "video" ? "clips only" : lockedKind === "image" ? "images only" : "select media";

  useEffect(() => {
    if (!open) return;
    setState(initialState(existing));
  }, [existing, open]);

  function buildImageItems(selectedMedia: string[], crossfadeSeconds: number): BgLayer["items"] {
    const slotDuration = duration / selectedMedia.length;
    const fadeSeconds = Math.min(crossfadeSeconds, slotDuration / 2);
    return selectedMedia.map((mediaId, index) => {
      const existingForIndex = existing?.items[index];
      const start = Math.max(0, index * slotDuration - (index > 0 ? fadeSeconds : 0));
      const end = Math.min(
        duration,
        (index + 1) * slotDuration + (index < selectedMedia.length - 1 ? fadeSeconds : 0),
      );
      const nextItem = {
        id: existingForIndex?.id ?? `bg-${Date.now()}-${index}`,
        mediaId,
        sentences: [1, Math.max(totalSentences, 1)] as [number, number],
        start,
        end,
        motion: { kind: state.motionKind, easing: state.easing },
        transitions: {
          in: index > 0 && crossfadeSeconds > 0 ? "fade" : "cut",
          out: index < selectedMedia.length - 1 && crossfadeSeconds > 0 ? "fade" : "cut",
        },
        crossfade: crossfadeSeconds,
      } as BgLayer["items"][number];
      return withBackgroundCacheStatus(existingForIndex, nextItem);
    });
  }

  function buildVideoItems(selectedMedia: string[], crossfadeSeconds: number): BgLayer["items"] {
    const items: BgLayer["items"] = [];
    let start = 0;
    for (let index = 0; index < selectedMedia.length; index += 1) {
      const mediaId = selectedMedia[index];
      if (!mediaId) continue;
      const mediaItem = mediaById.get(mediaId);
      const clipDuration = typeof mediaItem?.duration === "number" && mediaItem.duration > 0
        ? mediaItem.duration
        : Math.max(0, duration - start);
      const end = Math.min(duration, start + clipDuration);
      if (end <= start) break;
      const existingForIndex = existing?.items[index];
      const nextItem = {
        id: existingForIndex?.id ?? `bg-${Date.now()}-${index}`,
        mediaId,
        sentences: [1, Math.max(totalSentences, 1)] as [number, number],
        start,
        end,
        motion: { kind: state.motionKind, easing: state.easing },
        transitions: {
          in: index > 0 && crossfadeSeconds > 0 ? "fade" : "cut",
          out: index < selectedMedia.length - 1 && crossfadeSeconds > 0 && end < duration ? "fade" : "cut",
        },
        crossfade: crossfadeSeconds,
      } as BgLayer["items"][number];
      items.push(withBackgroundCacheStatus(existingForIndex, nextItem));
      start = end;
      if (start >= duration) break;
    }
    return items;
  }

  function handleSave() {
    if (state.selectedMedia.length === 0 || !isCrossfadeValid) return;
    const selectedKind = lockedKind ?? mediaById.get(state.selectedMedia[0] ?? "")?.kind;
    if (!selectedKind) return;
    const nextItems = selectedKind === "image"
      ? buildImageItems(state.selectedMedia, crossfade)
      : buildVideoItems(state.selectedMedia, crossfade);
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

  function moveMedia(mediaId: string, direction: -1 | 1) {
    setState((current) => {
      const index = current.selectedMedia.indexOf(mediaId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.selectedMedia.length) return current;
      const next = [...current.selectedMedia];
      const currentItem = next[index];
      const swapItem = next[nextIndex];
      if (!currentItem || !swapItem) return current;
      next[index] = swapItem;
      next[nextIndex] = currentItem;
      return { ...current, selectedMedia: next };
    });
  }

  if (!open) return null;

  return (
    <Dialog.Root onOpenChange={(next) => { if (!next) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
          <Dialog.Title className="mb-2 text-lg font-semibold">
            {isEdit ? "Change background" : "Add background"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Configure background playlist assets, motion, easing, and crossfade.
          </Dialog.Description>
          <p className="mb-5 text-sm text-neutral-600">
            {state.selectedMedia.length} selected · {selectedLabel}
          </p>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Assets
              </p>
              <button
                className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
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
            {media.length === 0 ? (
              <p className="text-sm opacity-50">No media added yet.</p>
            ) : (
              <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">
                {media.map((item) => (
                  <button
                    aria-pressed={state.selectedMedia.includes(item.mediaId)}
                    className={`relative aspect-video overflow-hidden rounded border-2 transition-colors ${
                      state.selectedMedia.includes(item.mediaId)
                        ? "border-sky-500 bg-sky-50"
                        : "border-transparent hover:border-neutral-300"
                    }`}
                    key={item.mediaId}
                    onClick={() => toggleMedia(item.mediaId)}
                    type="button"
                  >
                    {item.thumb_url ? (
                      <Image
                        alt={item.filename}
                        className="h-full w-full object-cover"
                        height={90}
                        src={`/api/server${item.thumb_url}`}
                        width={160}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-neutral-100 text-xs opacity-40">
                        {item.kind === "video" ? "▶" : "□"}
                      </div>
                    )}
                    {!state.selectedMedia.includes(item.mediaId) && lockedKind && item.kind !== lockedKind ? (
                      <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                        Will replace
                      </span>
                    ) : null}
                    <span className="sr-only">{item.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {state.selectedMedia.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">
                Order
              </p>
              <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {state.selectedMedia.map((mediaId, index) => (
                  <div
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs"
                    key={mediaId}
                  >
                    <span className="truncate">{mediaById.get(mediaId)?.filename ?? mediaId}</span>
                    <button
                      className="rounded px-1.5 py-0.5 opacity-50 hover:bg-neutral-100 hover:opacity-100 disabled:opacity-20"
                      disabled={index === 0}
                      onClick={() => moveMedia(mediaId, -1)}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 opacity-50 hover:bg-neutral-100 hover:opacity-100 disabled:opacity-20"
                      disabled={index === state.selectedMedia.length - 1}
                      onClick={() => moveMedia(mediaId, 1)}
                      type="button"
                    >
                      Down
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Motion
              </span>
              <select
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
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
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Easing
              </span>
              <select
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
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
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Crossfade (s)
              </span>
              <input
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
                max={2}
                min={0}
                onChange={(event) => setState((current) => ({ ...current, crossfadeInput: event.target.value }))}
                step={0.1}
                type="number"
                value={state.crossfadeInput}
              />
            </label>
          </div>
          {!isCrossfadeValid ? (
            <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              Crossfade must be between 0 and 2 seconds.
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              className="rounded px-3 py-1.5 text-sm opacity-50 hover:opacity-100"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded bg-neutral-950 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              disabled={state.selectedMedia.length === 0 || !isCrossfadeValid}
              onClick={handleSave}
              type="button"
            >
              {isEdit ? "Save changes" : "Add background"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
