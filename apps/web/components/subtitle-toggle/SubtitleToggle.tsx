"use client";

import { Captions } from "lucide-react";

type Props = {
  burnIn: boolean;
  disabled?: boolean;
  onChange: (burnIn: boolean) => void;
};

export function SubtitleToggle({ burnIn, disabled = false, onChange }: Props) {
  return (
    <section className="rounded border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Captions className="shrink-0 opacity-50" size={16} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">Burn subtitles into video</p>
            <p className="truncate text-[11px] opacity-40">
              Final renders use the generated subtitles.srt
            </p>
          </div>
        </div>
        <button
          aria-checked={burnIn}
          aria-label="Burn subtitles into video"
          className="relative h-5 w-9 shrink-0 rounded-full border border-neutral-300 bg-neutral-100 transition-colors aria-checked:bg-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => onChange(!burnIn)}
          role="switch"
          type="button"
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              burnIn ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
    </section>
  );
}
