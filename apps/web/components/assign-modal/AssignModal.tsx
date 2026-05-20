"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import  Image from "next/image";
import { buildFgItem, hasSentenceOverlap, nextZIndex } from "@/lib/layers";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

type MediaItem = { filename: string; kind: "image" | "video"; thumb_url: string };

type Props = {
  open: boolean;
  fromSentence: number;
  toSentence: number;
  editItemId?: string;
  editLayerId?: string;
  media: MediaItem[];
  sentences: AlignedSentence[];
  layers: Layer[];
  onImport?: (files: FileList | null) => Promise<void> | void;
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
  { value: "TL", label: "Top-left", posX: 12, posY: 12 },
  { value: "TC", label: "Top-center", posX: 50, posY: 12 },
  { value: "TR", label: "Top-right", posX: 88, posY: 12 },
  { value: "ML", label: "Middle-left", posX: 12, posY: 50 },
  { value: "MC", label: "Middle-center", posX: 50, posY: 50 },
  { value: "MR", label: "Middle-right", posX: 88, posY: 50 },
  { value: "BL", label: "Bottom-left", posX: 12, posY: 88 },
  { value: "BC", label: "Bottom-center", posX: 50, posY: 88 },
  { value: "BR", label: "Bottom-right", posX: 88, posY: 88 },
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
  const match = PIP_POSITION_OPTIONS.find((entry) => entry.posX === posX && entry.posY === posY);
  return match?.value ?? "BR";
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
  const [pipPosition, setPipPosition] = useState<PipPositionValue>("BR");
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
            motion: { kind: string; easing: string };
            transitions: { in: string; out: string };
            pip?: { posX: number; posY: number; size: number; radius: number; opacity: number };
          }
        | undefined;

      if (item) {
        setSelectedMedia(item.mediaId);
        setAnchorMode(item.anchor ?? "sentences");
        setFromTime(item.from ?? fmtClock(fromSentence));
        setToTime(item.to ?? fmtClock(toSentence));
        setMotion(item.motion.kind);
        setEasing(item.motion.easing);
        setTransIn(item.transitions.in);
        setTransOut(item.transitions.out);
        setCompositing(layer?.kind === "pip" ? "pip" : "fg");
        setLayerId(editLayerId);
        if (layer?.kind === "pip") {
          setPipPosition(pipPresetFromCoords(item.pip?.posX ?? 88, item.pip?.posY ?? 88));
          setPipSize(item.pip?.size ?? 22);
          setPipRadius(item.pip?.radius ?? 16);
          setPipOpacity(item.pip?.opacity ?? 90);
        } else {
          setPipPosition("BR");
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
      setPipPosition("BR");
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
    if (matchingLayers.length > 0 && layerId === "new") {
      setLayerId(matchingLayers[0]!.id);
    } else if (matchingLayers.length === 0) {
      setLayerId("new");
    }
  }, [compositing, matchingLayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Range preview
  const fromSentObj = sentences.find((s) => s.index === from);
  const toSentObj = sentences.find((s) => s.index === to);
  const rangePreview =
    anchorMode === "time"
      ? `${fromTime}–${toTime}`
      : fromSentObj && toSentObj
        ? `s${from}–s${to} · ${fmtTime(fromSentObj.start_s)}–${fmtTime(toSentObj.end_s)} · ${(toSentObj.end_s - fromSentObj.start_s).toFixed(1)}s`
        : `s${from}–s${to}`;

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
    const pipPlacement = pipCoordsFromPreset(pipPosition);
    const newItem =
      compositing === "pip"
        ? {
            ...newItemBase,
            pip: {
              posX: pipPlacement.posX,
              posY: pipPlacement.posY,
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

    if (layerId === "new" || !targetLayer) {
      const z = nextZIndex(layers, compositing);
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

      // Insert before BG layer (or at end)
      const bgIdx = layers.findIndex((l) => l.kind === "bg");
      if (bgIdx >= 0) {
        updatedLayers = [...layers.slice(0, bgIdx), newLayer, ...layers.slice(bgIdx)];
      } else {
        updatedLayers = [...layers, newLayer];
      }
    } else if (editItemId) {
      // Edit existing item
      updatedLayers = layers.map((l) => {
        if (l.id !== layerId) return l;
        return {
          ...l,
          items: l.items.map((it) => {
            if ((it as { id: string }).id !== editItemId) return it;
            return finalItem;
          }),
        } as Layer;
      });
    } else {
      // Add to existing layer
      updatedLayers = layers.map((l) => {
        if (l.id !== layerId) return l;
        return { ...l, items: [...l.items, finalItem] } as Layer;
      });
    }

    onConfirm(updatedLayers, newLayerId, newItemId);
    onClose();
  }

  return (
    <Dialog.Root onOpenChange={(o) => { if (!o) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl bg-white p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">
            {editItemId ? "Edit clip" : "Assign media"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Assign media to a sentence range.</Dialog.Description>

          {/* ── Asset picker ── */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">Asset</p>
            {onImport ? (
              <div className="mb-2">
                <button
                  className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-100"
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
              </div>
            ) : null}
            {media.length === 0 ? (
              <p className="text-sm opacity-50">No media added yet.</p>
            ) : (
              <div className="grid max-h-40 grid-cols-5 gap-2 overflow-y-auto">
                {media.map((item) => (
                  <button
                    className={`aspect-video overflow-hidden rounded border-2 transition-colors ${
                      selectedMedia === item.filename
                        ? "border-sky-500"
                        : "border-transparent hover:border-neutral-300"
                    }`}
                    key={item.filename}
                    onClick={() => setSelectedMedia(item.filename)}
                    type="button"
                  >
                    {item.thumb_url ? (
                      <Image
                        alt={item.filename}
                        className="h-full w-full object-cover"
                        src={`/api/server${item.thumb_url}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-neutral-100 text-xs opacity-40">
                        {item.kind === "video" ? "▶" : "□"}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sentence range ── */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">
              Anchor
            </p>
            <div className="mb-3 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  checked={anchorMode === "sentences"}
                  onChange={() => setAnchorMode("sentences")}
                  type="radio"
                />
                Sentences
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={anchorMode === "time"}
                  onChange={() => setAnchorMode("time")}
                  type="radio"
                />
                Time range
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-sm">
                From
                <input
                  className="w-16 rounded border border-neutral-200 px-2 py-1 text-center text-sm"
                  min={1}
                  onChange={(e) => setFrom(parseInt(e.target.value) || 1)}
                  type="number"
                  value={from}
                />
              </label>
              <label className="flex items-center gap-1 text-sm">
                To
                <input
                  className="w-16 rounded border border-neutral-200 px-2 py-1 text-center text-sm"
                  min={1}
                  onChange={(e) => setTo(parseInt(e.target.value) || 1)}
                  type="number"
                  value={to}
                />
              </label>
            </div>
            {anchorMode === "time" && (
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-1 text-sm">
                  From
                  <input
                    className="w-28 rounded border border-neutral-200 px-2 py-1 font-mono text-sm"
                    onChange={(e) => setFromTime(e.target.value)}
                    value={fromTime}
                  />
                </label>
                <label className="flex items-center gap-1 text-sm">
                  To
                  <input
                    className="w-28 rounded border border-neutral-200 px-2 py-1 font-mono text-sm"
                    onChange={(e) => setToTime(e.target.value)}
                    value={toTime}
                  />
                </label>
              </div>
            )}
            <p className="mt-1 font-mono text-xs opacity-50">{rangePreview}</p>
          </div>

          {/* ── Compositing ── */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">
              Compositing
            </p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  checked={compositing === "fg"}
                  onChange={() => setCompositing("fg")}
                  type="radio"
                />
                Fullscreen
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={compositing === "pip"}
                  onChange={() => setCompositing("pip")}
                  type="radio"
                />
                Picture-in-Picture
              </label>
            </div>
          </div>

          {compositing === "pip" ? (
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                  Placement
                </span>
                <select
                  className="rounded border border-neutral-200 px-2 py-1.5"
                  onChange={(event) => setPipPosition(event.target.value as PipPositionValue)}
                  value={pipPosition}
                >
                  {PIP_POSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                  Size %
                </span>
                <input
                  className="rounded border border-neutral-200 px-2 py-1.5"
                  max={60}
                  min={15}
                  onChange={(event) => setPipSize(Math.max(15, Math.min(60, Number(event.target.value) || 15)))}
                  type="number"
                  value={pipSize}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                  Radius px
                </span>
                <input
                  className="rounded border border-neutral-200 px-2 py-1.5"
                  max={32}
                  min={0}
                  onChange={(event) => setPipRadius(Math.max(0, Math.min(32, Number(event.target.value) || 0)))}
                  type="number"
                  value={pipRadius}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                  Opacity %
                </span>
                <input
                  className="rounded border border-neutral-200 px-2 py-1.5"
                  max={100}
                  min={10}
                  onChange={(event) => setPipOpacity(Math.max(10, Math.min(100, Number(event.target.value) || 10)))}
                  type="number"
                  value={pipOpacity}
                />
              </label>
            </div>
          ) : null}

          {/* ── Layer dropdown ── */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest opacity-40">Layer</p>
            <select
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
              onChange={(e) => setLayerId(e.target.value)}
              value={layerId}
            >
              {matchingLayers.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {l.name || `${compositing === "fg" ? "Foreground" : "PiP"} · z${i + 1}`}
                </option>
              ))}
              <option value="new">
                + Create new {compositing === "fg" ? "Foreground" : "PiP"} layer (z
                {nextZIndex(layers, compositing)})
              </option>
            </select>
          </div>

          {/* ── Motion & Easing ── */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-40">
                Motion
              </span>
              <select
                className="rounded border border-neutral-200 px-2 py-1.5"
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
                className="rounded border border-neutral-200 px-2 py-1.5 disabled:opacity-40"
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
                className="rounded border border-neutral-200 px-2 py-1.5"
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
                className="rounded border border-neutral-200 px-2 py-1.5"
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

          <div className="flex justify-end gap-3">
            <Dialog.Close
              className="rounded px-3 py-1.5 text-sm opacity-50 hover:opacity-100"
              onClick={onClose}
            >
              Cancel
            </Dialog.Close>
            <button
              className="rounded bg-neutral-950 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              disabled={!selectedMedia || !!rangeError}
              onClick={handleConfirm}
              type="button"
            >
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
