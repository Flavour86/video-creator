import { ImagePlus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { KeyboardEvent, RefObject, useEffect, useMemo, useRef } from "react";
import { Kbd, StatusTag } from "@/components/ui";
import { formatDuration, formatRangeLabel } from "@/lib/format";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type TranscriptPaneProps = {
  activeRange: [number, number];
  currentMatch: number;
  onAssign: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSeek: (time: number) => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sentences: AlignedSentence[];
};

export function TranscriptPane({
  activeRange,
  currentMatch,
  onAssign,
  onQueryChange,
  onSearchKeyDown,
  onSeek,
  query,
  searchInputRef,
  sentences,
}: TranscriptPaneProps) {
  const t = useTranslations("pages.editor");
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

  return (
    <aside className="flex min-h-0 flex-col bg-(--bg-1)">
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
        <StatusTag variant="info">{formatRangeLabel(activeRange[0], activeRange[1])}</StatusTag>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleSentences.map((sentence, index) => {
          const active = sentence.index >= activeRange[0] && sentence.index <= activeRange[1];
          const currentSearchMatch = query.trim() ? index === currentMatch : false;
          return (
            <div
              className={`group grid w-full grid-cols-[minmax(0,1fr)_32px] items-stretch border-l-2 text-sm leading-snug hover:bg-(--bg-2) ${
                active ? "border-l-(--amber) bg-(--amber-bg) text-(--text)" : currentSearchMatch ? "border-transparent bg-(--amber-bg)" : "border-transparent"
              }`}
              key={sentence.index}
              ref={currentSearchMatch ? activeMatchRef : undefined}
            >
              <button
                className="grid w-full grid-cols-[28px_44px_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-left"
                onClick={() => onSeek(sentence.start_s)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSeek(sentence.start_s);
                  onAssign(sentence.index);
                }}
                type="button"
              >
                <span className="pt-0.5 font-mono text-[11px] text-(--text-3)">{sentence.index}</span>
                <span className="pt-0.5 font-mono text-[11px] text-(--text-3)">{formatDuration(sentence.start_s)}</span>
                <span className="text-(--text-2)">{highlight(sentence.text, query)}</span>
              </button>
              <button
                aria-label={`Assign media to sentence ${sentence.index}`}
                className="flex items-center justify-center text-(--text-3) opacity-0 hover:text-(--amber) focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => {
                  onSeek(sentence.start_s);
                  onAssign(sentence.index);
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
    </aside>
  );
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
