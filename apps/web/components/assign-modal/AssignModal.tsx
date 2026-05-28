"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { buildFgItem, hasSentenceOverlap, nextZIndex } from "@/lib/layers";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

type MediaItem = {
  filename: string;
  kind: "image" | "video";
  thumb_url: string;
  importing?: boolean;
  import_progress?: number | null;
  import_error?: string | null;
};

type Props = {
  open: boolean;
  fromSentence: number;
  toSentence: number;
  editItemId?: string;
  editLayerId?: string;
  media: MediaItem[];
  sentences: AlignedSentence[];
  layers: Layer[];
  onImport?: (files: FileList | null) => Promise<unknown> | unknown;
  onConfirm: (updatedLayers: Layer[], newLayerId: string, newItemId: string) => void;
  onClose: () => void;
};

const MOTION_OPTIONS = [
  { value: "none", label: "None — static" },
  { value: "ken_burns", label: "Ken Burns · subtle" },
  { value: "ken_burns_strong", label: "Ken Burns · strong" },
  { value: "zoom_in", label: "Zoom in" },
  { value: "zoom_out", label: "Zoom out" },
  { value: "pan_left", label: "Pan left" },
  { value: "pan_right", label: "Pan right" },
];

const EASING_OPTIONS = [
  { value: "linear", label: "linear" },
  { value: "ease_in", label: "ease in" },
  { value: "ease_out", label: "ease out" },
  { value: "ease_in_out", label: "ease in-out" },
];

const TRANSITION_OPTIONS = [
  { value: "cut", label: "cut" },
  { value: "fade", label: "fade · 0.4s" },
  { value: "slide_left", label: "slide left" },
  { value: "slide_right", label: "slide right" },
  { value: "dip_black", label: "dip to black" },
];

const PIP_POSITION_OPTIONS = [
  { value: "TL", label: "Top-left", posX: 4, posY: 4 },
  { value: "TC", label: "Top-center", posX: 50, posY: 4 },
  { value: "TR", label: "Top-right", posX: 96, posY: 4 },
  { value: "ML", label: "Middle-left", posX: 4, posY: 50 },
  { value: "MC", label: "Middle-center", posX: 50, posY: 50 },
  { value: "MR", label: "Middle-right", posX: 96, posY: 50 },
  { value: "BL", label: "Bottom-left", posX: 4, posY: 96 },
  { value: "BC", label: "Bottom-center", posX: 50, posY: 96 },
  { value: "BR", label: "Bottom-right", posX: 96, posY: 96 },
] as const;

type PipPositionValue = (typeof PIP_POSITION_OPTIONS)[number]["value"];

type AssignVisualItem = {
  id: string;
  mediaId: string;
  anchor?: "sentences" | "time";
  from?: string;
  to?: string;
  sentences: [number, number];
  start: number;
  end: number;
  motion: { kind: string; easing: string };
  transitions: { in: string; out: string };
  pip?: { posX: number; posY: number; size: number; radius: number; opacity: number };
  cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function fmtClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return null;
  const [, hours, minutes, seconds, millis] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function pipCoordsFromPreset(value: PipPositionValue): { posX: number; posY: number } {
  const option = PIP_POSITION_OPTIONS.find((entry) => entry.value === value) ?? PIP_POSITION_OPTIONS[PIP_POSITION_OPTIONS.length - 1]!;
  return { posX: option.posX, posY: option.posY };
}

function pipPresetFromCoords(posX: number, posY: number): PipPositionValue {
  const row = posY < 34 ? "T" : posY >= 66 ? "B" : "M";
  const col = posX < 34 ? "L" : posX >= 66 ? "R" : "C";
  return `${row}${col}` as PipPositionValue;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function areItemsEquivalent(left: AssignVisualItem, right: AssignVisualItem): boolean {
  const leftPip = left.pip;
  const rightPip = right.pip;
  const samePip = !leftPip && !rightPip
    ? true
    : !!leftPip &&
      !!rightPip &&
      leftPip.posX === rightPip.posX &&
      leftPip.posY === rightPip.posY &&
      leftPip.size === rightPip.size &&
      leftPip.radius === rightPip.radius &&
      leftPip.opacity === rightPip.opacity;
  return (
    left.mediaId === right.mediaId &&
    left.anchor === right.anchor &&
    left.from === right.from &&
    left.to === right.to &&
    left.sentences[0] === right.sentences[0] &&
    left.sentences[1] === right.sentences[1] &&
    left.start === right.start &&
    left.end === right.end &&
    left.motion.kind === right.motion.kind &&
    left.motion.easing === right.motion.easing &&
    left.transitions.in === right.transitions.in &&
    left.transitions.out === right.transitions.out &&
    samePip
  );
}

function withEditCacheStatus(existing: AssignVisualItem | undefined, next: AssignVisualItem): AssignVisualItem {
  if (!existing) return { ...next, cache_status: "invalid" };
  if (areItemsEquivalent(existing, next)) {
    return existing.cache_status ? { ...next, cache_status: existing.cache_status } : next;
  }
  return { ...next, cache_status: "invalid" };
}

function removeEditedItem(layers: Layer[], layerId: string | undefined, itemId: string | undefined): Layer[] {
  if (!layerId || !itemId) return layers;
  return layers.flatMap((layer) => {
    if (layer.id !== layerId || layer.kind === "sub") return [layer];
    const items = layer.items.filter((item) => (item as { id?: string }).id !== itemId);
    if ((layer.kind === "fg" || layer.kind === "pip") && items.length === 0) return [];
    return [{ ...layer, items } as Layer];
  });
}

function appendItemToLayer(
  layers: Layer[],
  layerId: string,
  item: AssignVisualItem,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id !== layerId || layer.kind === "sub" || layer.kind === "bg") return layer;
    return { ...layer, items: [...layer.items, item] } as Layer;
  });
}

function replaceItemInLayer(
  layers: Layer[],
  layerId: string,
  itemId: string,
  item: AssignVisualItem,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id !== layerId || layer.kind === "sub" || layer.kind === "bg") return layer;
    return {
      ...layer,
      items: layer.items.map((candidate) => ((candidate as { id?: string }).id === itemId ? item : candidate)),
    } as Layer;
  });
}

function insertVisualLayer(layers: Layer[], layer: Layer): Layer[] {
  const bgIdx = layers.findIndex((candidate) => candidate.kind === "bg");
  if (bgIdx >= 0) {
    return [...layers.slice(0, bgIdx), layer, ...layers.slice(bgIdx)];
  }
  return [...layers, layer];
}

export function AssignModal({
  open,
  fromSentence,
  toSentence,
  editItemId,
  editLayerId,
  media,
  sentences,
  layers,
  onImport,
  onConfirm,
  onClose,
}: Props) {
  const [selectedMedia, setSelectedMedia] = useState("");
  const [from, setFrom] = useState(fromSentence);
  const [to, setTo] = useState(toSentence);
  const [anchorMode, setAnchorMode] = useState<"sentences" | "time">("sentences");
  const [fromTime, setFromTime] = useState("0:00:00.000");
  const [toTime, setToTime] = useState("0:00:05.000");
  const [compositing, setCompositing] = useState<"fg" | "pip">("fg");
  const [layerId, setLayerId] = useState<string>("new");
  const [motion, setMotion] = useState("ken_burns");
  const [easing, setEasing] = useState("ease_in_out");
  const [transIn, setTransIn] = useState("fade");
  const [transOut, setTransOut] = useState("fade");
  const [pipPosX, setPipPosX] = useState(96);
  const [pipPosY, setPipPosY] = useState(96);
  const [pipSize, setPipSize] = useState(22);
  const [pipRadius, setPipRadius] = useState(16);
  const [pipOpacity, setPipOpacity] = useState(90);
  const [submitError, setSubmitError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync state when modal opens with new props
  useEffect(() => {
    if (!open) return;
    setFrom(fromSentence);
    setTo(toSentence);
    setSubmitError("");

    if (editItemId && editLayerId) {
      const layer = layers.find((l) => l.id === editLayerId);
      const item = layer?.items.find(
        (it) => (it as { id: string }).id === editItemId,
      ) as
        | {
            id: string;
            mediaId: string;
            anchor?: "sentences" | "time";
            from?: string;
            to?: string;
            sentences: [number, number];
            motion?: { kind: string; easing: string };
            transitions?: { in: string; out: string };
            pip?: { posX: number; posY: number; size: number; radius: number; opacity: number };
          }
        | undefined;

      if (item) {
        setSelectedMedia(item.mediaId);
        setAnchorMode(item.anchor ?? "sentences");
        setFromTime(item.from ?? fmtClock(fromSentence));
        setToTime(item.to ?? fmtClock(toSentence));
        setMotion(item.motion?.kind ?? "none");
        setEasing(item.motion?.easing ?? "linear");
        setTransIn(item.transitions?.in ?? "cut");
        setTransOut(item.transitions?.out ?? "cut");
        setCompositing(layer?.kind === "pip" ? "pip" : "fg");
        setLayerId(editLayerId);
        if (layer?.kind === "pip") {
          setPipPosX(item.pip?.posX ?? 96);
          setPipPosY(item.pip?.posY ?? 96);
          setPipSize(item.pip?.size ?? 22);
          setPipRadius(item.pip?.radius ?? 16);
          setPipOpacity(item.pip?.opacity ?? 90);
        } else {
          setPipPosX(96);
          setPipPosY(96);
          setPipSize(22);
          setPipRadius(16);
          setPipOpacity(90);
        }
      }
    } else {
      setSelectedMedia("");
      setAnchorMode("sentences");
      setFromTime(fmtClock(sentences.find((s) => s.index === fromSentence)?.start_s ?? 0));
      setToTime(fmtClock(sentences.find((s) => s.index === toSentence)?.end_s ?? 5));
      setMotion("ken_burns");
      setEasing("ease_in_out");
      setTransIn("fade");
      setTransOut("fade");
      setCompositing("fg");
      setPipPosX(96);
      setPipPosY(96);
      setPipSize(22);
      setPipRadius(16);
      setPipOpacity(90);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Compute matching layers for the selected compositing kind
  const matchingLayers = layers.filter((l) => l.kind === compositing) as Extract<
    Layer,
    { kind: "fg" | "pip" }
  >[];

  useEffect(() => {
    if (layerId !== "new" && !matchingLayers.some((layer) => layer.id === layerId)) {
      setLayerId("new");
    }
  }, [compositing, layerId, matchingLayers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Range preview
  const fromSentObj = sentences.find((s) => s.index === from);
  const toSentObj = sentences.find((s) => s.index === to);
  const rangePreview =
    anchorMode === "time"
      ? `${fromTime}–${toTime}`
      : fromSentObj && toSentObj
        ? `s${from}–s${to} · ${fmtTime(fromSentObj.start_s)}–${fmtTime(toSentObj.end_s)} · ${(toSentObj.end_s - fromSentObj.start_s).toFixed(1)}s`
        : `s${from}–s${to}`;
  const rangeSentences = from <= to
    ? sentences.filter((sentence) => sentence.index >= from && sentence.index <= to)
    : [];
  const rangeDuration = fromSentObj && toSentObj
    ? Math.max(0, toSentObj.end_s - fromSentObj.start_s)
    : 0;
  const rangeTimeLabel = fromSentObj && toSentObj
    ? `${fmtTime(fromSentObj.start_s)}–${fmtTime(toSentObj.end_s)} · ${rangeDuration.toFixed(1)}s`
    : rangePreview;
  const fieldClass = "rounded border border-(--line) bg-(--bg-2) px-2 py-1.5 text-sm text-(--text) outline-none focus:border-(--amber)";

  const parsedFromTime = parseClock(fromTime);
  const parsedToTime = parseClock(toTime);
  const audioDuration = Math.max(0, ...sentences.map((sentence) => sentence.end_s));
  const maxSentenceIndex = Math.max(1, ...sentences.map((sentence) => sentence.index));
  const rangeError =
    anchorMode === "time"
      ? parsedFromTime === null || parsedToTime === null
        ? "Use HH:MM:SS.mmm time format"
        : parsedFromTime >= parsedToTime
          ? '"From" must be before "To"'
          : parsedToTime > audioDuration
            ? '"To" must be within audio duration'
          : null
      : from < 1 || to < 1
        ? "Sentence range must start at 1"
        : from > maxSentenceIndex || to > maxSentenceIndex
          ? `Sentence range must be within 1-${maxSentenceIndex}`
          : from > to
            ? '"From" must be ≤ "To"'
            : null;

  function handleConfirm() {
    if (rangeError) return;
    if (!selectedMedia) return;

    const targetLayer =
      layerId !== "new" ? matchingLayers.find((l) => l.id === layerId) : undefined;
    const existingEditLayer = editLayerId
      ? layers.find((layer) => layer.id === editLayerId && layer.kind !== "sub")
      : undefined;
    const existingEditItem = existingEditLayer?.items.find(
      (candidate) => (candidate as { id?: string }).id === editItemId,
    ) as AssignVisualItem | undefined;

    if (targetLayer) {
      const overlaps = hasSentenceOverlap(
        targetLayer.items as { id: string; sentences: [number, number] }[],
        from,
        to,
        editItemId,
      );
      if (overlaps) {
        setSubmitError("Overlaps with existing item in this layer");
        return;
      }
    }

    const startTime = anchorMode === "time" ? parsedFromTime! : fromSentObj?.start_s ?? 0;
    const endTime = anchorMode === "time" ? parsedToTime! : toSentObj?.end_s ?? 0;
    const newItemId = editItemId ?? `item-${Date.now()}`;

    const newItemBase = buildFgItem({
      id: newItemId,
      mediaId: selectedMedia,
      from,
      to,
      startTime,
      endTime,
      anchor: anchorMode,
      fromTime: anchorMode === "time" ? fromTime : undefined,
      toTime: anchorMode === "time" ? toTime : undefined,
      motion,
      easing,
      transIn,
      transOut,
    });
    const newItem =
      compositing === "pip"
        ? {
            ...newItemBase,
            pip: {
              posX: pipPosX,
              posY: pipPosY,
              size: pipSize,
              radius: pipRadius,
              opacity: pipOpacity,
            },
          }
        : newItemBase;
    const finalItem = editItemId
      ? withEditCacheStatus(existingEditItem, newItem as AssignVisualItem)
      : newItem;

    let newLayerId = layerId;
    let updatedLayers: Layer[];

    if (editItemId && editLayerId && layerId !== "new" && targetLayer?.id === editLayerId) {
      updatedLayers = replaceItemInLayer(layers, editLayerId, editItemId, finalItem as AssignVisualItem);
    } else if (layerId === "new" || !targetLayer) {
      const baseLayers = editItemId ? removeEditedItem(layers, editLayerId, editItemId) : layers;
      const z = nextZIndex(baseLayers, compositing);
      newLayerId = `L-${compositing}-${Date.now()}`;
      const newLayer: Layer =
        compositing === "fg"
          ? {
              id: newLayerId,
              kind: "fg",
              name: `Foreground · z${z}`,
              items: [finalItem as Extract<Layer, { kind: "fg" }>["items"][number]],
            }
          : {
              id: newLayerId,
              kind: "pip",
              name: `PiP · z${z}`,
              items: [finalItem as Extract<Layer, { kind: "pip" }>["items"][number]],
            };

      updatedLayers = insertVisualLayer(baseLayers, newLayer);
    } else if (editItemId) {
      const baseLayers = removeEditedItem(layers, editLayerId, editItemId);
      updatedLayers = appendItemToLayer(baseLayers, layerId, finalItem as AssignVisualItem);
    } else {
      // Add to existing layer
      updatedLayers = appendItemToLayer(layers, layerId, finalItem as AssignVisualItem);
    }

    onConfirm(updatedLayers, newLayerId, newItemId);
    onClose();
  }

  return (
    <Dialog.Root onOpenChange={(o) => { if (!o) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[94vh] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-(--line) bg-(--bg-1) text-(--text) shadow-(--shadow-2)">
          <header className="flex items-start gap-4 border-b border-(--line-soft) px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[18px] font-semibold tracking-normal">
                {editItemId ? "Edit media to range" : "Assign media to range"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-(--text-3)">
                Place a media asset over a span of sentences. The timeline is computed automatically.
              </Dialog.Description>
            </div>
            <button aria-label="Close" className="rounded p-1 text-(--text-3) hover:text-(--text)" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4" data-testid="assign-modal-body">
          {/* ── Asset picker ── */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">Asset</p>
                <span className="font-mono text-[11px] text-(--text-3)">
                  {selectedMedia ? `${selectedMedia} selected` : "No asset chosen"}
                </span>
              </div>
              {onImport ? (
                <>
                  <button
                    className="rounded border border-(--line) bg-(--bg-2) px-2.5 py-1.5 text-xs font-semibold text-(--text-2) hover:bg-(--bg-3)"
                    onClick={() => inputRef.current?.click()}
                    type="button"
                  >
                    Import from disk...
                  </button>
                  <input
                    className="hidden"
                    multiple
                    onChange={(event) => {
                      void onImport(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    ref={inputRef}
                    type="file"
                  />
                </>
              ) : null}
            </div>
            {media.length === 0 ? (
              <p className="text-sm text-(--text-3)">No media added yet.</p>
            ) : (
              <div className="grid max-h-[320px] grid-cols-4 gap-2 overflow-y-auto">
                {media.map((item) => {
                  const active = selectedMedia === item.filename;
                  return (
                    <button
                      aria-label={`${item.filename}${active ? " selected" : ""}`}
                      aria-pressed={active}
                      className={`overflow-hidden rounded-md border p-1 text-left transition-colors ${
                        active
                          ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                          : item.import_error
                            ? "border-(--red) bg-(--bg-2)"
                          : "border-(--line) bg-(--bg-2) hover:bg-(--bg-3)"
                      }`}
                      disabled={item.importing || !!item.import_error}
                      key={item.filename}
                      onClick={() => setSelectedMedia(item.filename)}
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
                          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,oklch(0.34_0.07_270),oklch(0.48_0.12_55))] text-xs text-white/60">
                            {item.kind === "video" ? "MP4" : "IMG"}
                          </div>
                        )}
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white">
                          {item.kind === "video" ? "MP4" : "IMG"}
                        </span>
                        {active ? (
                          <span className="absolute right-1.5 top-1.5 rounded bg-(--amber) px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-(--bg-0)">
                            Selected
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 truncate text-[12px] text-(--text)">{item.filename}</div>
                      {item.importing ? (
                        <div className="truncate font-mono text-[10px] text-(--blue)">
                          Importing {Math.max(0, Math.min(100, Math.round(item.import_progress ?? 0)))}%
                        </div>
                      ) : null}
                      {item.import_error ? (
                        <div className="truncate font-mono text-[10px] text-(--red)">
                          Import failed: {item.import_error}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sentence range ── */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">
                Sentence range
              </p>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-mono text-xs font-semibold text-sky-600 dark:bg-sky-950 dark:text-sky-300">
                ● {rangeTimeLabel}
              </span>
            </div>
            {anchorMode === "time" && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-sm">
                  From
                  <input
                    className={`${fieldClass} w-32 font-mono`}
                    onChange={(e) => setFromTime(e.target.value)}
                    value={fromTime}
                  />
                </label>
                <label className="flex items-center gap-1 text-sm">
                  To
                  <input
                    className={`${fieldClass} w-32 font-mono`}
                    onChange={(e) => setToTime(e.target.value)}
                    value={toTime}
                  />
                </label>
              </div>
            )}
            {anchorMode === "sentences" ? (
              <>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-(--text-2)">
                    From
                    <input
                      className={`${fieldClass} w-20 text-center`}
                      min={1}
                      onChange={(e) => setFrom(parseInt(e.target.value) || 1)}
                      type="number"
                      value={from}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-(--text-2)">
                    To
                    <input
                      className={`${fieldClass} w-20 text-center`}
                      min={1}
                      onChange={(e) => setTo(parseInt(e.target.value) || 1)}
                      type="number"
                      value={to}
                    />
                  </label>
                </div>
                <div className="mt-2 max-h-32 overflow-y-auto rounded border border-(--line) bg-(--bg-2)">
                  {rangeSentences.length > 0 ? (
                    rangeSentences.map((sentence) => (
                      <div
                        className="grid grid-cols-[48px_1fr] border-b border-(--line-soft) px-3 py-2 text-sm last:border-b-0"
                        key={sentence.index}
                      >
                        <span className="font-mono text-xs text-(--text-3)">s{sentence.index}</span>
                        <span className="text-(--text-2)">{sentence.text}</span>
                      </div>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-(--text-3)">No sentences in range.</p>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* ── Compositing ── */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">
              Compositing
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                aria-pressed={compositing === "fg"}
                className={`rounded-md border p-3 text-left transition-colors ${
                  compositing === "fg"
                    ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                    : "border-(--line) bg-(--bg-2) hover:bg-(--bg-3)"
                }`}
                onClick={() => setCompositing("fg")}
                type="button"
              >
                <div className="aspect-[16/9] rounded-sm bg-[linear-gradient(135deg,oklch(0.38_0.07_270),oklch(0.56_0.13_55))]" />
                <p className="mt-2 text-sm font-semibold text-(--text)">Fullscreen</p>
                <p className="mt-1 text-xs text-(--text-3)">Foreground replaces background while active.</p>
              </button>
              <button
                aria-pressed={compositing === "pip"}
                className={`rounded-md border p-3 text-left transition-colors ${
                  compositing === "pip"
                    ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                    : "border-(--line) bg-(--bg-2) hover:bg-(--bg-3)"
                }`}
                onClick={() => setCompositing("pip")}
                type="button"
              >
                <div className="relative aspect-[16/9] rounded-sm bg-[linear-gradient(135deg,oklch(0.25_0.06_65),oklch(0.36_0.08_60))]">
                  <span className="absolute bottom-4 right-4 h-16 w-36 rounded bg-[linear-gradient(135deg,oklch(0.42_0.09_270),oklch(0.58_0.12_20))] shadow-lg" />
                </div>
                <p className="mt-2 text-sm font-semibold text-(--text)">Picture-in-picture</p>
                <p className="mt-1 text-xs text-(--text-3)">Overlay sits on top; multi-stack supported.</p>
              </button>
            </div>
          </div>

          {/* ── Layer dropdown ── */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">Layer</p>
            <select
              aria-label="Layer"
              className={`${fieldClass} w-full`}
              onChange={(e) => setLayerId(e.target.value)}
              value={layerId}
            >
              {matchingLayers.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {`${l.name || `${compositing === "fg" ? "Foreground" : "PiP"} · z${i + 1}`} · ${l.items.length} items`}
                </option>
              ))}
              <option value="new">
                + Create new {compositing === "fg" ? "Foreground" : "PiP"} layer (z
                {nextZIndex(layers, compositing)})
              </option>
            </select>
          </div>

          {compositing === "pip" ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-3)">PiP placement</p>
              <div className="grid grid-cols-[180px_1fr] gap-5">
                <div className="grid grid-cols-3 gap-1 rounded border border-(--line) bg-(--bg-2) p-1">
                  {PIP_POSITION_OPTIONS.map((option) => (
                    <button
                      aria-label={option.label}
                      aria-pressed={pipPresetFromCoords(pipPosX, pipPosY) === option.value}
                      className={`h-9 rounded text-xs font-semibold ${
                        pipPresetFromCoords(pipPosX, pipPosY) === option.value
                          ? "bg-(--amber) text-white"
                          : "bg-(--bg-1) text-(--text-3) hover:text-(--text)"
                      }`}
                      key={option.value}
                      onClick={() => {
                        const next = pipCoordsFromPreset(option.value);
                        setPipPosX(next.posX);
                        setPipPosY(next.posY);
                      }}
                      type="button"
                    >
                      {option.value}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3">
                  <label className="grid grid-cols-[80px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-(--text-3)">POSX</span>
                    <input
                      aria-label="PiP POSX"
                      className={fieldClass}
                      max={100}
                      min={0}
                      onChange={(event) => setPipPosX(clampPercent(Number(event.target.value) || 0))}
                      type="number"
                      value={pipPosX}
                    />
                    <span className="text-right text-xs text-(--text-3)">%</span>
                  </label>
                  <label className="grid grid-cols-[80px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-(--text-3)">POSY</span>
                    <input
                      aria-label="PiP POSY"
                      className={fieldClass}
                      max={100}
                      min={0}
                      onChange={(event) => setPipPosY(clampPercent(Number(event.target.value) || 0))}
                      type="number"
                      value={pipPosY}
                    />
                    <span className="text-right text-xs text-(--text-3)">%</span>
                  </label>
                  <label className="grid grid-cols-[80px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-(--text-3)">Size</span>
                    <input
                      max={60}
                      min={15}
                      onChange={(event) => setPipSize(Math.max(15, Math.min(60, Number(event.target.value) || 15)))}
                      type="range"
                      value={pipSize}
                    />
                    <span className="text-right text-xs text-(--text-3)">{pipSize}%</span>
                  </label>
                  <label className="grid grid-cols-[80px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-(--text-3)">Radius</span>
                    <input
                      max={32}
                      min={0}
                      onChange={(event) => setPipRadius(Math.max(0, Math.min(32, Number(event.target.value) || 0)))}
                      type="range"
                      value={pipRadius}
                    />
                    <span className="text-right text-xs text-(--text-3)">{pipRadius}px</span>
                  </label>
                  <label className="grid grid-cols-[80px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-(--text-3)">Opacity</span>
                    <input
                      max={100}
                      min={10}
                      onChange={(event) => setPipOpacity(Math.max(10, Math.min(100, Number(event.target.value) || 10)))}
                      type="range"
                      value={pipOpacity}
                    />
                    <span className="text-right text-xs text-(--text-3)">{pipOpacity}%</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Motion & Easing ── */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Motion
              </span>
              <select
                className={fieldClass}
                onChange={(e) => setMotion(e.target.value)}
                value={motion}
              >
                {MOTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Easing
              </span>
              <select
                className={`${fieldClass} disabled:opacity-40`}
                disabled={motion === "none"}
                onChange={(e) => setEasing(e.target.value)}
                value={easing}
              >
                {EASING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ── Transitions ── */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Transition In
              </span>
              <select
                className={fieldClass}
                onChange={(e) => setTransIn(e.target.value)}
                value={transIn}
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Transition Out
              </span>
              <select
                className={fieldClass}
                onChange={(e) => setTransOut(e.target.value)}
                value={transOut}
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rangeError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{rangeError}</p>
          )}
          {submitError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{submitError}</p>
          )}

          </div>

          <footer className="flex justify-end gap-3 border-t border-(--line-soft) bg-(--bg-2) px-6 py-4">
            <Dialog.Close
              className="rounded px-3 py-1.5 text-sm text-(--text-2) hover:text-(--text)"
              onClick={onClose}
            >
              Cancel
            </Dialog.Close>
            <button
              className="rounded bg-(--text) px-4 py-1.5 text-sm font-semibold text-(--bg-0) disabled:opacity-40"
              disabled={!selectedMedia || !!rangeError}
              onClick={handleConfirm}
              type="button"
            >
              {editItemId ? "Save changes" : "Add to project"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
