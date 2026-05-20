import { ImagePlus, Play, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui";
import { formatDuration, formatRangeLabel } from "@/lib/format";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type TranscriptPaneProps = {
  activeRange: [number, number];
  currentMatch: number;
  onAssignRange: (range: [number, number]) => void;
  onMergeRange: (range: [number, number]) => void;
  onPlayFrom: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSeek: (time: number) => void;
  onScrollPositionChange?: (scrollTop: number) => void;
  onSelectRange: (range: [number, number]) => void;
  query: string;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  selectedRange: [number, number] | null;
  sentences: AlignedSentence[];
};

export function TranscriptPane({
  activeRange,
  currentMatch,
  onAssignRange,
  onMergeRange,
  onPlayFrom,
  onQueryChange,
  onSearchKeyDown,
  onSeek,
  onScrollPositionChange,
  onSelectRange,
  query,
  scrollContainerRef,
  searchInputRef,
  selectedRange,
  sentences,
}: TranscriptPaneProps) {
  const t = useTranslations("pages.editor");
  const [menu, setMenu] = useState<{ index: number; range: [number, number]; x: number; y: number } | null>(null);
  const visibleSentences = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sentences;
    return sentences.filter((sentence) => sentence.text.toLowerCase().includes(normalized) || `s${sentence.index}`.includes(normalized));
  }, [query, sentences]);
  const activeMatchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    activeMatchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [currentMatch, query, visibleSentences]);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const chipRange = selectedRange ?? activeRange;
  const sentenceRefs = useRef(new Map<number, HTMLDivElement>());
  const selectionScrollReadyRef = useRef(false);

  useEffect(() => {
    if (!selectionScrollReadyRef.current) {
      selectionScrollReadyRef.current = true;
      return;
    }
    if (!selectedRange) return;
    sentenceRefs.current.get(selectedRange[1])?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [selectedRange]);

  return (
    <aside className="relative flex min-h-0 flex-col bg-(--bg-1)">
      <div className="flex items-center gap-2 border-b border-(--line) px-3 py-2.5">
        <Search aria-hidden="true" className="h-4 w-4 text-(--text-3)" />
        <input
          aria-label={t("searchPlaceholder")}
          className="flex-1 rounded border border-(--line) bg-(--bg-2) px-2.5 py-1.5 text-[12px] text-(--text) outline-none placeholder:text-(--text-4) focus-visible:border-(--amber)"
          id="editor-transcript-search"
          name="editor-transcript-search"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t("searchPlaceholder")}
          ref={searchInputRef}
          type="search"
          value={query}
        />
        <button onClick={() => searchInputRef.current?.focus()} type="button">
          <Kbd>⌘F</Kbd>
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-(--line) px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">
          {t("transcriptHead", { count: sentences.length })}
        </span>
        <span className="rounded border border-(--amber-line) bg-(--amber-bg) px-[7px] py-[2px] font-mono text-[11px] text-(--amber)">
          {formatRangeLabel(chipRange[0], chipRange[1])}
        </span>
      </div>
      <div
        data-testid="transcript-list"
        className="min-h-0 flex-1 overflow-y-auto py-[6px]"
        onScroll={(event) => onScrollPositionChange?.(event.currentTarget.scrollTop)}
        ref={scrollContainerRef}
      >
        {visibleSentences.length === 0 && query.trim() ? (
          <div className="px-4 py-6 text-sm text-(--text-3)" role="status">
            {t("searchNoResults", { query: query.trim() })}
          </div>
        ) : null}
        {visibleSentences.map((sentence, index) => {
          const active = sentence.index >= activeRange[0] && sentence.index <= activeRange[1];
          const selected = selectedRange ? sentence.index >= selectedRange[0] && sentence.index <= selectedRange[1] : false;
          const currentSearchMatch = query.trim() ? index === currentMatch : false;
          const lowConfidence = sentence.confidence_avg < 0.75;
          const orphan = sentence.end_s <= sentence.start_s;
          const activeNow = sentence.index === activeRange[0];
          const rowRange: [number, number] = selected && selectedRange ? [selectedRange[0], selectedRange[1]] : [sentence.index, sentence.index];
          return (
            <div
              className={`group relative grid w-full grid-cols-1 items-stretch border-l-2 text-[13px] leading-[1.5] text-(--text-2) hover:bg-(--bg-2) ${
                selected
                  ? "border-l-(--amber) bg-(--amber-bg) text-(--text)"
                  : lowConfidence || orphan
                    ? "border-l-(--red) text-(--red)"
                    : "border-transparent"
              } ${activeNow ? "bg-(--bg-3)" : ""} ${currentSearchMatch ? "ring-1 ring-(--amber-line) ring-inset" : ""}`}
              key={sentence.index}
              ref={(node) => {
                if (node) {
                  sentenceRefs.current.set(sentence.index, node);
                } else {
                  sentenceRefs.current.delete(sentence.index);
                }
                if (currentSearchMatch) {
                  activeMatchRef.current = node;
                }
              }}
            >
              <button
                className="grid w-full grid-cols-[32px_90px_minmax(0,1fr)] items-baseline gap-2 pl-0 pr-3 py-[7px] text-left"
                onClick={(event) => {
                  const range: [number, number] = event.shiftKey
                    ? normalizeRange(selectedRange?.[0] ?? activeRange[0], sentence.index)
                    : [sentence.index, sentence.index];
                  onSelectRange(range);
                  onSeek(sentence.start_s);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelectRange(rowRange);
                  onSeek(sentence.start_s);
                  setMenu({ index: sentence.index, range: rowRange, x: event.clientX, y: event.clientY });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.shiftKey) {
                    event.preventDefault();
                    onAssignRange([sentence.index, sentence.index]);
                  }
                }}
                type="button"
              >
                <span
                  className={`text-right font-mono text-[10.5px] ${selected ? "text-(--amber)" : lowConfidence || orphan ? "text-(--red)" : "text-(--text-4)"}`}
                >
                  {sentence.index}
                </span>
                <span className={`font-mono text-[10.5px] ${selected ? "text-(--amber)" : lowConfidence || orphan ? "text-(--red)" : "text-(--text-3)"}`}>
                  {formatDuration(sentence.start_s)}-{formatDuration(sentence.end_s)}
                </span>
                <span className="[text-wrap:pretty]">
                  {highlight(sanitizeSentenceText(sentence.text), query)}
                  {lowConfidence ? <span className="ml-2 font-mono text-[10px] uppercase text-(--red)">{t("lowConfidence")}</span> : null}
                  {orphan ? <span className="ml-2 font-mono text-[10px] uppercase text-(--red)">{t("orphanSentence")}</span> : null}
                </span>
              </button>
              {activeNow ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-(--text) shadow-[0_0_10px_var(--text)]" /> : null}
              <button
                aria-label={`Assign media to sentence ${sentence.index}`}
                className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-1 text-(--text-3) opacity-0 hover:text-(--amber) focus-visible:opacity-100 group-hover:opacity-100"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onSelectRange(rowRange);
                  onSeek(sentence.start_s);
                  setMenu({ index: sentence.index, range: rowRange, x: rect.left, y: rect.bottom + 4 });
                }}
                title={`Assign media to sentence ${sentence.index}`}
                type="button"
              >
                <ImagePlus aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      {menu ? (
        <SentenceContextMenu
          index={menu.index}
          range={menu.range}
          totalSentences={sentences.length}
          onAssign={() => {
            onAssignRange([menu.index, menu.index]);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
          onMergeRange={() => {
            onMergeRange(menu.range);
            setMenu(null);
          }}
          onPlay={() => {
            onPlayFrom(menu.index);
            setMenu(null);
          }}
          x={menu.x}
          y={menu.y}
        />
      ) : null}
    </aside>
  );
}

function SentenceContextMenu({
  index,
  range,
  totalSentences,
  onAssign,
  onClose,
  onMergeRange,
  onPlay,
  x,
  y,
}: {
  index: number;
  range: [number, number];
  totalSentences: number;
  onAssign: () => void;
  onClose: () => void;
  onMergeRange: () => void;
  onPlay: () => void;
  x: number;
  y: number;
}) {
  const t = useTranslations("pages.editor");
  const normalizedRange = normalizeRange(range[0], range[1]);
  const selectedCount = normalizedRange[1] - normalizedRange[0] + 1;
  const mergeCount = selectedCount > 1 ? selectedCount : Math.min(2, Math.max(1, totalSentences - normalizedRange[0] + 1));
  const canMerge = mergeCount >= 2;
  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-md border border-(--line) bg-(--bg-2) p-1 text-sm text-(--text) shadow-2xl"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
      style={{ left: x, top: y }}
      tabIndex={-1}
    >
      <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-(--bg-3)" onClick={onAssign} role="menuitem" type="button">
        <Upload aria-hidden="true" className="h-4 w-4 text-(--text-3)" />
        {t("menu.assignRange")}
      </button>
      <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-(--bg-3)" onClick={onPlay} role="menuitem" type="button">
        <Play aria-hidden="true" className="h-4 w-4 text-(--text-3)" />
        {t("menu.playFromHere")}
      </button>
      <div className="my-1 h-px bg-(--line-soft)" />
      <button
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-(--text-3) disabled:cursor-not-allowed disabled:opacity-60 hover:bg-(--bg-3)"
        disabled={!canMerge}
        onClick={onMergeRange}
        role="menuitem"
        type="button"
      >
        {t("menu.mergeSentences", { count: mergeCount })}
      </button>
    </div>
  );
}

function normalizeRange(start: number, end: number): [number, number] {
  return [Math.min(start, end), Math.max(start, end)];
}

function sanitizeSentenceText(text: string): string {
  return text.replace(/[*`]+/g, "").trim();
}

function highlight(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const lower = text.toLowerCase();
  const index = lower.indexOf(trimmed.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-(--amber-bg) px-0.5 text-(--text)">{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}
