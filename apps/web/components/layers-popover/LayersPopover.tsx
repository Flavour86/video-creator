"use client";

import { useEffect, useRef, useState } from "react";

import type { Layer } from "@/lib/preview/resolveDisplay";

type Props = {
  layers: Layer[];
  selectedLayerId: string | null;
  selectedItemId: string | null;
  onSelectItem: (layerId: string, itemId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onAddItem: () => void;
};

function layerItemCount(layer: Layer): number {
  return layer.items.length;
}

function totalItemCount(layers: Layer[]): number {
  return layers.filter((l) => l.kind !== "sub").reduce((sum, l) => sum + l.items.length, 0);
}

export function LayersPopover({
  layers,
  selectedLayerId,
  selectedItemId,
  onSelectItem,
  onDeleteLayer,
  onAddItem,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const total = totalItemCount(layers);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1.5 rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        Layers · <span>{total}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 max-h-[360px] overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-xl">
          {/* Render order: top to bottom */}
          {[...layers].reverse().map((layer) => {
            const count = layerItemCount(layer);
            const isDeletable = layer.kind !== "sub";
            const isSelected = layer.id === selectedLayerId;
            const firstItemId =
              layer.items.length > 0
                ? (layer.items[0] as { id: string }).id
                : undefined;

            return (
              <div
                className={`flex items-center justify-between border-b border-neutral-100 px-3 py-2 last:border-0 ${
                  isSelected ? "bg-sky-50" : "hover:bg-neutral-50"
                }`}
                key={layer.id}
              >
                <button
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  disabled={!firstItemId}
                  onClick={() => {
                    if (firstItemId) onSelectItem(layer.id, firstItemId);
                  }}
                  type="button"
                >
                  <span className="truncate text-sm font-medium">{layer.name}</span>
                  <span className="text-xs opacity-40">
                    {layer.kind === "sub"
                      ? count === 1 ? "1 cue" : `${count} cues`
                      : count === 1 ? "1 item" : `${count} items`}
                  </span>
                </button>
                {isDeletable && (
                  <button
                    aria-label="Delete layer"
                    className="ml-2 shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                    onClick={() => onDeleteLayer(layer.id)}
                    type="button"
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })}

          <div className="border-t border-neutral-100 p-2">
            <button
              className="w-full rounded border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              onClick={() => { onAddItem(); setOpen(false); }}
              type="button"
            >
              + Add layer item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
