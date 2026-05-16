"use client";

import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";
import Image from "next/image";

type MediaItem = { filename: string; kind: "image" | "video"; thumb_url: string };

type VisualItem = {
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
};

type Props = {
  selectedLayerId: string | null;
  selectedItemId: string | null;
  layers: Layer[];
  sentences: AlignedSentence[];
  media: MediaItem[];
  projectPath: string;
  onLayersChange: (layers: Layer[]) => void;
  onOpenAssignEdit: (layerId: string, itemId: string, from: number, to: number) => void;
  onDeselect: () => void;
};

const MOTION_OPTIONS = [
  { value: "none", label: "None" },
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

function patchItem(
  layers: Layer[],
  layerId: string,
  itemId: string,
  patch: Partial<VisualItem>,
): Layer[] {
  return layers.map((l) => {
    if (l.id !== layerId) return l;
    return {
      ...l,
      items: l.items.map((it) => {
        if ((it as { id: string }).id !== itemId) return it;
        return { ...(it as VisualItem), ...patch };
      }),
    } as Layer;
  });
}

export function InspectorPanel({
  selectedLayerId,
  selectedItemId,
  layers,
  sentences,
  media,
  projectPath,
  onLayersChange,
  onOpenAssignEdit,
  onDeselect,
}: Props) {
  if (!selectedLayerId || !selectedItemId) return null;

  const layer = layers.find((l) => l.id === selectedLayerId);
  const item = layer?.items.find(
    (it) => (it as { id: string }).id === selectedItemId,
  ) as VisualItem | undefined;

  if (!layer || !item) return null;

  const [fromIdx, toIdx] = item.sentences;
  const fromSent = sentences.find((s) => s.index === fromIdx);
  const toSent = sentences.find((s) => s.index === toIdx);
  const rangeLabel =
    fromSent && toSent
      ? `s${fromIdx}–s${toIdx} · ${(toSent.end_s - fromSent.start_s).toFixed(1)}s`
      : `s${fromIdx}–s${toIdx}`;

  const thumbFilename = item.mediaId.replace(/\.[^.]+$/, ".jpg");
  const thumbUrl = projectPath
    ? `/api/server/projects/thumb?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(thumbFilename)}`
    : undefined;

  const mediaEntry = media.find((m) => m.filename === item.mediaId);

  function updateMotion(kind: string) {
    onLayersChange(
      patchItem(layers, selectedLayerId!, selectedItemId!, {
        motion: { kind, easing: item!.motion.easing },
      }),
    );
  }

  function updateEasing(easing: string) {
    onLayersChange(
      patchItem(layers, selectedLayerId!, selectedItemId!, {
        motion: { kind: item!.motion.kind, easing },
      }),
    );
  }

  function updateTransIn(transIn: string) {
    onLayersChange(
      patchItem(layers, selectedLayerId!, selectedItemId!, {
        transitions: { in: transIn, out: item!.transitions.out },
      }),
    );
  }

  function updateTransOut(transOut: string) {
    onLayersChange(
      patchItem(layers, selectedLayerId!, selectedItemId!, {
        transitions: { in: item!.transitions.in, out: transOut },
      }),
    );
  }

  function handleDelete() {
    const updated = layers
      .map((l) => {
        if (l.id !== selectedLayerId) return l;
        return {
          ...l,
          items: l.items.filter((it) => (it as { id: string }).id !== selectedItemId),
        } as Layer;
      })
      .filter((l) => l.kind === "sub" || l.kind === "bg" || l.items.length > 0);

    onLayersChange(updated);
    onDeselect();
  }

  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 pb-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-40">Inspector</p>
        <button
          className="text-xs opacity-30 hover:opacity-70"
          onClick={onDeselect}
          type="button"
        >
          ✕
        </button>
      </div>

      {/* Thumbnail */}
      <button
        className="overflow-hidden rounded border border-neutral-200 hover:border-sky-400"
        onClick={() => onOpenAssignEdit(selectedLayerId, selectedItemId, fromIdx, toIdx)}
        title="Click to change media"
        type="button"
      >
        {thumbUrl && mediaEntry ? (
          <Image
            alt={item.mediaId}
            className="h-20 w-full object-cover"
            src={thumbUrl}
          />
        ) : (
          <div className="flex h-20 items-center justify-center bg-neutral-100 text-xs opacity-40">
            {item.mediaId}
          </div>
        )}
      </button>

      {/* Range */}
      <p className="font-mono text-xs opacity-60">{rangeLabel}</p>

      {/* Layer name */}
      <p className="text-xs opacity-40">{layer.name}</p>

      {/* Motion */}
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold uppercase tracking-widest opacity-40">Motion</span>
        <select
          aria-label="Motion"
          className="rounded border border-neutral-200 px-2 py-1 text-sm"
          onChange={(e) => updateMotion(e.target.value)}
          value={item.motion.kind}
        >
          {MOTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Easing */}
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold uppercase tracking-widest opacity-40">Easing</span>
        <select
          aria-label="Easing"
          className="rounded border border-neutral-200 px-2 py-1 text-sm disabled:opacity-40"
          disabled={item.motion.kind === "none"}
          onChange={(e) => updateEasing(e.target.value)}
          value={item.motion.easing}
        >
          {EASING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Transitions */}
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold uppercase tracking-widest opacity-40">Transition In</span>
        <select
          aria-label="Transition In"
          className="rounded border border-neutral-200 px-2 py-1 text-sm"
          onChange={(e) => updateTransIn(e.target.value)}
          value={item.transitions.in}
        >
          {TRANSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold uppercase tracking-widest opacity-40">Transition Out</span>
        <select
          aria-label="Transition Out"
          className="rounded border border-neutral-200 px-2 py-1 text-sm"
          onChange={(e) => updateTransOut(e.target.value)}
          value={item.transitions.out}
        >
          {TRANSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Delete */}
      <button
        aria-label="Delete item"
        className="mt-1 rounded border border-red-200 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
        onClick={handleDelete}
        type="button"
      >
        Delete
      </button>
    </div>
  );
}
