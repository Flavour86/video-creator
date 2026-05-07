"use client";

import { useEffect, useRef } from "react";
import type { AlignmentResult } from "@/lib/hooks/useAlignment";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

type Props = {
  result: AlignmentResult;
  selected: Set<number>;
  currentTime?: number;
  onSelect: (index: number, shift: boolean, ctrl: boolean) => void;
  onSeek?: (time: number) => void;
};

export function TranscriptPanel({ result, selected, currentTime, onSelect, onSeek }: Props) {
  const activeIndex = currentTime != null
    ? result.sentences.find((s) => s.start_s <= currentTime && currentTime < s.end_s)?.index
    : undefined;

  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Scroll active sentence into view during playback
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <section className="flex flex-col divide-y divide-neutral-100 overflow-auto rounded-lg border border-neutral-200">
      {result.sentences.map((s) => {
        const isActive = s.index === activeIndex;
        const isSelected = selected.has(s.index);
        return (
          <button
            className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 ${
              isActive
                ? "border-l-2 border-sky-500 bg-sky-50/60 font-medium"
                : isSelected
                  ? "bg-neutral-100 font-medium"
                  : ""
            }`}
            key={s.index}
            onClick={(e) => {
              onSelect(s.index, e.shiftKey, e.ctrlKey || e.metaKey);
              onSeek?.(s.start_s);
            }}
            ref={isActive ? (el) => { activeRef.current = el; } : undefined}
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
        );
      })}
    </section>
  );
}
