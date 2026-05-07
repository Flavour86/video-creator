"use client";

import type { AlignmentResult } from "@/lib/hooks/useAlignment";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

type Props = {
  result: AlignmentResult;
  selected: Set<number>;
  onSelect: (index: number, shift: boolean, ctrl: boolean) => void;
};

export function TranscriptPanel({ result, selected, onSelect }: Props) {
  return (
    <section className="flex flex-col divide-y divide-neutral-100 overflow-auto rounded-lg border border-neutral-200">
      {result.sentences.map((s) => (
        <button
          className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 ${
            selected.has(s.index) ? "bg-neutral-100 font-medium" : ""
          }`}
          key={s.index}
          onClick={(e) => onSelect(s.index, e.shiftKey, e.ctrlKey || e.metaKey)}
          type="button"
        >
          <span className="w-5 shrink-0 pt-px text-right text-xs tabular-nums opacity-40">
            {s.index}
          </span>
          <span className="flex-1 leading-snug">{s.text}</span>
          <span className="shrink-0 pt-px font-mono text-xs tabular-nums opacity-40">
            {fmtTime(s.start_s)}
          </span>
        </button>
      ))}
    </section>
  );
}
