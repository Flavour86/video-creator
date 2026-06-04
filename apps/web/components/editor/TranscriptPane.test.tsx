import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { TranscriptPane } from "./TranscriptPane";

const sentences = [
  { confidence_avg: 0.95, end_s: 5, index: 1, start_s: 0, text: "Capitalism begins here." },
  { confidence_avg: 0.7, end_s: 10, index: 2, start_s: 5, text: "Low confidence sentence." },
  { confidence_avg: 0.9, end_s: 10, index: 3, start_s: 10, text: "**Orphan** row." },
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderPane(overrides: Partial<ComponentProps<typeof TranscriptPane>> = {}) {
  const props: ComponentProps<typeof TranscriptPane> = {
    activeRange: [1, 1],
    currentMatch: 0,
    onAssignRange: vi.fn(),
    onMergeRange: vi.fn(),
    onPlayFrom: vi.fn(),
    onQueryChange: vi.fn(),
    onSearchKeyDown: vi.fn(),
    onSeek: vi.fn(),
    onSelectRange: vi.fn(),
    onUpdateSentenceText: vi.fn(),
    query: "",
    searchInputRef: { current: null },
    selectedRange: null,
    sentences,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TranscriptPane {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("TranscriptPane", () => {
  it("renders search, count, range chip, and distinct sentence states", () => {
    renderPane();

    expect(screen.getByRole("searchbox", { name: /search transcript/i })).toBeInTheDocument();
    expect(screen.getByText(/Transcript.*3 aligned/)).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 00:00-00:05 Capitalism begins here/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign media to sentence/i })).not.toBeInTheDocument();
    expect(screen.queryByText("low conf")).not.toBeInTheDocument();
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(screen.queryByText("**Orphan** row.")).not.toBeInTheDocument();
  });

  it("highlights search matches", () => {
    renderPane({ query: "capital" });

    expect(screen.getByText("Capital", { selector: "mark" })).toBeInTheDocument();
  });

  it("renders a no-results state when search has no matches", () => {
    renderPane({ query: "zzz" });
    expect(screen.getByRole("status")).toHaveTextContent("No transcript matches for \"zzz\".");
  });

  it("seeks without highlighting on ordinary click, while shift-click selects a contiguous range", () => {
    const props = renderPane({ selectedRange: [1, 1] });

    fireEvent.click(screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i }));
    expect(props.onSelectRange).toHaveBeenLastCalledWith(null);
    expect(props.onSeek).toHaveBeenLastCalledWith(5);

    fireEvent.click(screen.getByRole("button", { name: /3 00:10-00:10 Orphan row/i }), { shiftKey: true });
    expect(props.onSelectRange).toHaveBeenLastCalledWith([1, 3]);
    expect(props.onSeek).toHaveBeenCalledTimes(1);
  });

  it("applies playback-position highlighting separately from manual range selection", () => {
    renderPane({ activeRange: [2, 2], selectedRange: [1, 1] });

    const selectedRow = screen.getByRole("button", { name: /1 00:00-00:05 Capitalism begins here/i }).parentElement;
    const currentRow = screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i }).parentElement;
    expect(selectedRow).toHaveClass("bg-(--amber-bg)");
    expect(currentRow).toHaveAttribute("aria-current", "true");
    expect(currentRow).toHaveClass("bg-(--bg-3)");
  });

  it("opens the sentence menu from right-click without seeking", () => {
    const props = renderPane();

    fireEvent.contextMenu(screen.getByRole("button", { name: /1 00:00-00:05 Capitalism begins here/i }), { clientX: 30, clientY: 40 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /merge/i })).not.toBeInTheDocument();
    expect(props.onSeek).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /assign media to range/i }));
    expect(props.onAssignRange).toHaveBeenCalledWith([1, 1]);
  });

  it("uses the selected contiguous range for merge count and callback", () => {
    const props = renderPane({ selectedRange: [1, 3] });

    fireEvent.contextMenu(screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i }), { clientX: 18, clientY: 22 });
    fireEvent.click(screen.getByRole("menuitem", { name: /merge 3 sentences/i }));

    expect(props.onMergeRange).toHaveBeenCalledWith([1, 3]);
  });

  it("uses the selected contiguous range for assign from the context menu", () => {
    const props = renderPane({ selectedRange: [1, 3] });

    fireEvent.contextMenu(screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i }), { clientX: 18, clientY: 22 });
    fireEvent.click(screen.getByRole("menuitem", { name: /assign media to range/i }));

    expect(props.onAssignRange).toHaveBeenCalledWith([1, 3]);
  });

  it("edits one row in a fixed-height textarea with confirm, cancel, and empty draft handling", () => {
    const props = renderPane();
    const sentence = screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i });
    const row = sentence.parentElement;
    expect(row).toHaveClass("grid-cols-[32px_90px_minmax(0,1fr)_48px]");
    expect(row).not.toHaveClass("h-10");
    expect(screen.getAllByRole("button", { name: /edit sentence/i })).toHaveLength(sentences.length);

    fireEvent.click(screen.getByRole("button", { name: /edit sentence 2/i }));
    expect(screen.getByTestId("transcript-sentence-edit-shell-2")).toHaveTextContent("Low confidence sentence.");
    const editor = screen.getByRole("textbox", { name: /edit sentence 2 text/i });
    expect(editor).toHaveValue("Low confidence sentence.");
    expect(editor).toHaveClass("absolute", "inset-0", "min-h-full", "px-2", "py-[3px]");

    fireEvent.change(editor, { target: { value: "Cancelled sentence." } });
    fireEvent.click(screen.getByRole("button", { name: /cancel sentence 2 edit/i }));
    expect(props.onUpdateSentenceText).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /2 00:05-00:10 Low confidence sentence/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit sentence 2/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /edit sentence 2 text/i }), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /confirm sentence 2 edit/i })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: /edit sentence 2 text/i }), { target: { value: "Updated transcript sentence." } });
    fireEvent.click(screen.getByRole("button", { name: /confirm sentence 2 edit/i }));
    expect(props.onUpdateSentenceText).toHaveBeenCalledWith(2, "Updated transcript sentence.");
  });

  it("renders a 500-sentence transcript window within the frame budget", () => {
    const manySentences = Array.from({ length: 500 }, (_, index) => ({
      confidence_avg: 0.95,
      end_s: index + 1,
      index: index + 1,
      start_s: index,
      text: `Sentence ${index + 1}`,
    }));

    renderPane({ sentences: manySentences });
    const list = screen.getByTestId("transcript-list");

    expect(screen.getByText(/Transcript.*500 aligned/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign media to sentence/i })).not.toBeInTheDocument();

    fireEvent.scroll(list, { target: { scrollTop: 2000 } });
    const frameTimes = [2400, 2800, 3200, 3600, 4000].map((scrollTop) => {
      const startedAt = performance.now();
      fireEvent.scroll(list, { target: { scrollTop } });
      return performance.now() - startedAt;
    });
    const medianFrameMs = [...frameTimes].sort((a, b) => a - b)[Math.floor(frameTimes.length / 2)];

    expect(medianFrameMs).toBeLessThan(16);
    expect(screen.getByRole("button", { name: /101 01:40-01:41 Sentence 101/i })).toBeInTheDocument();
  });
});
