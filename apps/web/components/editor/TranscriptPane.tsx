import { ImagePlus, Play, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Kbd, StatusTag } from "@/components/ui";
import { formatDuration, formatRangeLabel } from "@/lib/format";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type TranscriptPaneProps = {
  activeRange: [number, number];
  currentMatch: number;
  onAssignRange: (range: [number, number]) => void;
  onMergeNext: (index: number) => void;
  onPlayFrom: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSeek: (time: number) => void;
  onSelectRange: (range: [number, number]) => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  selectedRange: [number, number] | null;
  sentences: AlignedSentence[];
};

export function TranscriptPane({
  activeRange,
  currentMatch,
  onAssignRange,
  onMergeNext,
  onPlayFrom,
  onQueryChange,
  onSearchKeyDown,
  onSeek,
  onSelectRange,
  query,
  searchInputRef,
  selectedRange,
  sentences,
}: TranscriptPaneProps) {
  const t = useTranslations("pages.editor");
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
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

  return (
    <aside className="relative flex min-h-0 flex-col bg-(--bg-1)">
      <div className="flex items-center gap-2 border-b border-(--line) px-3 py-2">
        <Search aria-hidden="true" className="h-4 w-4 text-(--text-3)" />
        <input
          aria-label={t("searchPlaceholder")}
          className="flex-1 rounded border border-(--line) bg-(--bg-2) px-2 py-1 text-xs text-(--text) outline-none placeholder:text-(--text-4) focus-visible:border-(--amber)"
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
      <div className="flex items-center justify-between border-b border-(--line-soft) px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">
          {t("transcriptHead", { count: sentences.length })}
        </span>
        <StatusTag variant={selectedRange ? "ready" : "info"}>{formatRangeLabel(chipRange[0], chipRange[1])}</StatusTag>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleSentences.map((sentence, index) => {
          const active = sentence.index >= activeRange[0] && sentence.index <= activeRange[1];
          const selected = selectedRange ? sentence.index >= selectedRange[0] && sentence.index <= selectedRange[1] : false;
          const currentSearchMatch = query.trim() ? index === currentMatch : false;
          const lowConfidence = sentence.confidence_avg < 0.75;
          const orphan = sentence.end_s <= sentence.start_s;
          return (
            <div
              className={`group grid w-full grid-cols-[minmax(0,1fr)_32px] items-stretch border-l-2 text-sm leading-snug hover:bg-(--bg-2) ${
                selected
                  ? "border-l-(--amber) bg-(--amber-bg) text-(--text)"
                  : active
                    ? "border-l-(--amber) bg-(--bg-2) text-(--text)"
                    : currentSearchMatch
                      ? "border-transparent bg-(--amber-bg)"
                      : lowConfidence || orphan
                        ? "border-l-(--red) bg-(--bg-1)"
                        : "border-transparent"
              }`}
              key={sentence.index}
              ref={currentSearchMatch ? activeMatchRef : undefined}
            >
              <button
                className="grid w-full grid-cols-[28px_44px_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-left"
                onClick={(event) => {
                  const range: [number, number] = event.shiftKey
                    ? normalizeRange(selectedRange?.[0] ?? activeRange[0], sentence.index)
                    : [sentence.index, sentence.index];
                  onSelectRange(range);
                  onSeek(sentence.start_s);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelectRange([sentence.index, sentence.index]);
                  onSeek(sentence.start_s);
                  setMenu({ index: sentence.index, x: event.clientX, y: event.clientY });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.shiftKey) {
                    event.preventDefault();
                    onAssignRange([sentence.index, sentence.index]);
                  }
                }}
                type="button"
              >
                <span className="pt-0.5 font-mono text-[11px] text-(--text-3)">{sentence.index}</span>
                <span className="pt-0.5 font-mono text-[11px] text-(--text-3)">{formatDuration(sentence.start_s)}</span>
                <span className="text-(--text-2)">
                  {highlight(sanitizeSentenceText(sentence.text), query)}
                  {lowConfidence ? <span className="ml-2 font-mono text-[10px] uppercase text-(--red)">{t("lowConfidence")}</span> : null}
                  {orphan ? <span className="ml-2 font-mono text-[10px] uppercase text-(--red)">{t("orphanSentence")}</span> : null}
                </span>
              </button>
              <button
                aria-label={`Assign media to sentence ${sentence.index}`}
                className="flex items-center justify-center text-(--text-3) opacity-0 hover:text-(--amber) focus-visible:opacity-100 group-hover:opacity-100"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onSelectRange([sentence.index, sentence.index]);
                  onSeek(sentence.start_s);
                  setMenu({ index: sentence.index, x: rect.left, y: rect.bottom + 4 });
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
          onAssign={() => {
            onAssignRange([menu.index, menu.index]);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
          onMergeNext={() => {
            onMergeNext(menu.index);
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
  onAssign,
  onClose,
  onMergeNext,
  onPlay,
  x,
  y,
}: {
  index: number;
  onAssign: () => void;
  onClose: () => void;
  onMergeNext: () => void;
  onPlay: () => void;
  x: number;
  y: number;
}) {
  const t = useTranslations("pages.editor");
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
      <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-(--text-3) hover:bg-(--bg-3)" onClick={onMergeNext} role="menuitem" type="button">
        {t("menu.mergeNext", { index })}
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
