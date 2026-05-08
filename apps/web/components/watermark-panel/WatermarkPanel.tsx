"use client";

import { BadgeIcon, X } from "lucide-react";

import type { WatermarkSettings } from "@/lib/hooks/useProject";

type MediaItem = { filename: string; kind: "image" | "video"; thumb_url: string };

type Props = {
  media: MediaItem[];
  value: WatermarkSettings | null;
  onChange: (watermark: WatermarkSettings | null) => void;
};

const POSITIONS = [
  { label: "TL", posX: 0, posY: 0 },
  { label: "TC", posX: 50, posY: 0 },
  { label: "TR", posX: 100, posY: 0 },
  { label: "ML", posX: 0, posY: 50 },
  { label: "MC", posX: 50, posY: 50 },
  { label: "MR", posX: 100, posY: 50 },
  { label: "BL", posX: 0, posY: 100 },
  { label: "BC", posX: 50, posY: 100 },
  { label: "BR", posX: 100, posY: 100 },
];

export function WatermarkPanel({ media, value, onChange }: Props) {
  const imageMedia = media.filter((item) => item.kind === "image");
  const selected = value?.mediaId ?? "";

  function patch(delta: Partial<WatermarkSettings>) {
    if (!value) return;
    onChange({ ...value, ...delta });
  }

  function select(mediaId: string) {
    onChange({
      mediaId,
      posX: value?.posX ?? 100,
      posY: value?.posY ?? 100,
      scale: value?.scale ?? 0.08,
      opacity: value?.opacity ?? 60,
    });
  }

  return (
    <section className="rounded border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BadgeIcon className="shrink-0 opacity-50" size={16} />
          <p className="truncate text-xs font-semibold">Watermark</p>
        </div>
        {value && (
          <button
            aria-label="Remove watermark"
            className="rounded p-1 opacity-40 hover:bg-neutral-100 hover:opacity-80"
            onClick={() => onChange(null)}
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <select
        className="mb-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs"
        onChange={(event) => select(event.target.value)}
        value={selected}
      >
        <option value="">No watermark</option>
        {imageMedia.map((item) => (
          <option key={item.filename} value={item.filename}>
            {item.filename}
          </option>
        ))}
      </select>

      {value && (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-1">
            {POSITIONS.map((position) => {
              const active = value.posX === position.posX && value.posY === position.posY;
              return (
                <button
                  className={`rounded border px-1 py-1 text-[10px] font-semibold ${
                    active
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                  key={position.label}
                  onClick={() => patch({ posX: position.posX, posY: position.posY })}
                  type="button"
                >
                  {position.label}
                </button>
              );
            })}
          </div>

          <label className="grid gap-1 text-[11px] font-medium opacity-70">
            Scale
            <input
              max={0.3}
              min={0.05}
              onChange={(event) => patch({ scale: Number(event.target.value) })}
              step={0.01}
              type="range"
              value={value.scale}
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium opacity-70">
            Opacity
            <input
              max={100}
              min={0}
              onChange={(event) => patch({ opacity: Number(event.target.value) })}
              step={5}
              type="range"
              value={value.opacity}
            />
          </label>
        </div>
      )}
    </section>
  );
}
