"use client";

import { BadgeIcon, X } from "lucide-react";

import type { WatermarkSettings } from "@/lib/hooks/useProject";

type MediaItem = {
  mediaId: string;
  filename: string;
  kind: "image" | "video" | "watermark_image" | "watermark_video";
  thumb_url?: string | null;
};

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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function WatermarkPanel({ media, value, onChange }: Props) {
  const selectable = media.filter((item) => item.kind === "image" || item.kind === "video" || item.kind === "watermark_image" || item.kind === "watermark_video");
  const enabled = value !== null;
  const selected = value?.mediaId ?? "";
  const selectedMedia = selectable.find((item) => item.mediaId === selected || item.filename === selected) ?? null;

  function patch(delta: Partial<WatermarkSettings>) {
    if (!value) return;
    onChange({ ...value, ...delta });
  }

  function select(mediaId: string) {
    if (!mediaId) {
      onChange(null);
      return;
    }
    onChange({
      mediaId,
      posX: value?.posX ?? 100,
      posY: value?.posY ?? 100,
      scale: value?.scale ?? 0.08,
      opacity: value?.opacity ?? 60,
    });
  }

  function toggleEnabled(nextEnabled: boolean) {
    if (!nextEnabled) {
      onChange(null);
      return;
    }
    const fallback = selectable[0];
    if (!fallback) return;
    select(fallback.mediaId || fallback.filename);
  }

  return (
    <section className="rounded border border-(--line) bg-(--bg-2) p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BadgeIcon className="shrink-0 opacity-50" size={16} />
          <p className="truncate text-xs font-semibold">Watermark</p>
        </div>
        {enabled && (
          <button
            aria-label="Remove watermark"
            className="rounded p-1 opacity-50 hover:bg-(--bg-3) hover:opacity-100"
            onClick={() => onChange(null)}
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        aria-checked={enabled}
        aria-label="Watermark enabled"
        className={`mb-2 inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
          enabled ? "border-(--blue) bg-(--blue)" : "border-(--line) bg-(--bg-3)"
        }`}
        onClick={() => toggleEnabled(!enabled)}
        role="switch"
        type="button"
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>

      <select
        aria-label="Watermark asset"
        className="mb-2 w-full rounded border border-(--line) bg-(--bg-1) px-2 py-1.5 text-xs"
        disabled={!enabled}
        onChange={(event) => select(event.target.value)}
        value={selected}
      >
        <option value="">No watermark</option>
        {selectable.map((item) => (
          <option key={item.mediaId || item.filename} value={item.mediaId || item.filename}>
            {item.filename}
          </option>
        ))}
      </select>

      {enabled && value && (
        <div className="grid gap-3">
          <div className="relative h-20 overflow-hidden rounded border border-(--line) bg-(--bg-1)" data-testid="watermark-preview">
            {selectedMedia?.thumb_url ? (
              <img
                alt={`Preview ${selectedMedia.filename}`}
                className="h-full w-full object-cover opacity-70"
                src={selectedMedia.thumb_url}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-(--text-3)">
                No watermark preview
              </div>
            )}
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-black/30"
              style={{ left: `${value.posX}%`, top: `${value.posY}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {POSITIONS.map((position) => {
              const active = value.posX === position.posX && value.posY === position.posY;
              return (
                <button
                  aria-label={`Watermark placement ${position.label}`}
                  className={`rounded border px-1 py-1 text-[10px] font-semibold ${
                    active
                      ? "border-(--blue) bg-(--blue) text-white"
                      : "border-(--line) hover:bg-(--bg-3)"
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

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[11px] font-medium opacity-70">
              POSX
              <input
                aria-label="Watermark POSX"
                className="rounded border border-(--line) bg-(--bg-1) px-2 py-1 text-xs"
                max={100}
                min={0}
                onChange={(event) => patch({ posX: clampPercent(Number(event.target.value) || 0) })}
                type="number"
                value={value.posX}
              />
            </label>
            <label className="grid gap-1 text-[11px] font-medium opacity-70">
              POSY
              <input
                aria-label="Watermark POSY"
                className="rounded border border-(--line) bg-(--bg-1) px-2 py-1 text-xs"
                max={100}
                min={0}
                onChange={(event) => patch({ posY: clampPercent(Number(event.target.value) || 0) })}
                type="number"
                value={value.posY}
              />
            </label>
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
