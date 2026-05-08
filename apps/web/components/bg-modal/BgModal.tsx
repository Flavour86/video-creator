"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

type MediaItem = { filename: string; kind: "image" | "video"; thumb_url: string };

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
  }>;
};

type Props = {
  media: MediaItem[];
  existing?: BgLayer;
  totalSentences: number;
  duration: number;
  onSave: (layer: BgLayer) => void;
  children: React.ReactNode;
};

const MOTION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "ken_burns", label: "Ken Burns" },
  { value: "zoom_in", label: "Zoom In" },
  { value: "zoom_out", label: "Zoom Out" },
  { value: "pan_left", label: "Pan Left" },
  { value: "pan_right", label: "Pan Right" },
];

export function BgModal({ media, existing, totalSentences, duration, onSave, children }: Props) {
  const existingItem = existing?.items[0];
  const [open, setOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string[]>(
    existing?.items.map((item) => item.mediaId) ?? [],
  );
  const [motionKind, setMotionKind] = useState(existingItem?.motion.kind ?? "none");
  const [crossfade, setCrossfade] = useState(existingItem?.crossfade ?? 0);

  const isEdit = !!existing;

  function handleSave() {
    if (selectedMedia.length === 0) return;
    const slotDuration = duration / selectedMedia.length;
    const fadeSeconds = Math.min(crossfade, slotDuration / 2);
    const layer: BgLayer = {
      id: existing?.id ?? `L-bg-${Date.now()}`,
      kind: "bg",
      name: "Background",
      items: selectedMedia.map((mediaId, index) => {
        const start = Math.max(0, index * slotDuration - (index > 0 ? fadeSeconds : 0));
        const end = Math.min(
          duration,
          (index + 1) * slotDuration + (index < selectedMedia.length - 1 ? fadeSeconds : 0),
        );
        const existingForMedia = existing?.items.find((item) => item.mediaId === mediaId);
        return {
          id: existingForMedia?.id ?? `bg-${Date.now()}-${index}`,
          mediaId,
          sentences: [1, Math.max(totalSentences, 1)] as [number, number],
          start,
          end,
          motion: { kind: motionKind, easing: "linear" },
          transitions: {
            in: index > 0 && crossfade > 0 ? "fade" : "cut",
            out: index < selectedMedia.length - 1 && crossfade > 0 ? "fade" : "cut",
          },
          crossfade,
        };
      }),
    };
    onSave(layer);
    setOpen(false);
  }

  function toggleMedia(filename: string) {
    setSelectedMedia((current) =>
      current.includes(filename)
        ? current.filter((item) => item !== filename)
        : [...current, filename],
    );
  }

  function moveMedia(filename: string, direction: -1 | 1) {
    setSelectedMedia((current) => {
      const index = current.indexOf(filename);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const currentItem = next[index];
      const swapItem = next[nextIndex];
      if (!currentItem || !swapItem) return current;
      next[index] = swapItem;
      next[nextIndex] = currentItem;
      return next;
    });
  }

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
          <Dialog.Title className="mb-5 text-lg font-semibold">
            {isEdit ? "Change Background" : "Add Background"}
          </Dialog.Title>

          {/* Asset picker */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">
              Assets
            </p>
            {media.length === 0 ? (
              <p className="text-sm opacity-50">No media added yet.</p>
            ) : (
              <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">
                {media.map((item) => (
                  <button
                    className={`aspect-video overflow-hidden rounded border-2 transition-colors ${
                      selectedMedia.includes(item.filename)
                        ? "border-sky-500"
                        : "border-transparent hover:border-neutral-300"
                    }`}
                    key={item.filename}
                    onClick={() => toggleMedia(item.filename)}
                    type="button"
                  >
                    {item.thumb_url ? (
                      <img
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

          {selectedMedia.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest opacity-40">
                Order
              </p>
              <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {selectedMedia.map((filename, index) => (
                  <div
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs"
                    key={filename}
                  >
                    <span className="truncate">{filename}</span>
                    <button
                      className="rounded px-1.5 py-0.5 opacity-50 hover:bg-neutral-100 hover:opacity-100 disabled:opacity-20"
                      disabled={index === 0}
                      onClick={() => moveMedia(filename, -1)}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 opacity-50 hover:bg-neutral-100 hover:opacity-100 disabled:opacity-20"
                      disabled={index === selectedMedia.length - 1}
                      onClick={() => moveMedia(filename, 1)}
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
                onChange={(e) => setMotionKind(e.target.value)}
                value={motionKind}
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
                Crossfade (s)
              </span>
              <input
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
                max={2}
                min={0}
                onChange={(e) => setCrossfade(parseFloat(e.target.value) || 0)}
                step={0.1}
                type="number"
                value={crossfade}
              />
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <Dialog.Close className="rounded px-3 py-1.5 text-sm opacity-50 hover:opacity-100">
              Cancel
            </Dialog.Close>
            <button
              className="rounded bg-neutral-950 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              disabled={selectedMedia.length === 0}
              onClick={handleSave}
              type="button"
            >
              {isEdit ? "Update" : "Set Background"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
