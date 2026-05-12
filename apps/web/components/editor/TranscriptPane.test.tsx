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
    onMergeNext: vi.fn(),
    onPlayFrom: vi.fn(),
    onQueryChange: vi.fn(),
    onSearchKeyDown: vi.fn(),
    onSeek: vi.fn(),
    onSelectRange: vi.fn(),
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
  it("renders search, count, range chip, add handles, and distinct sentence states", () => {
    renderPane();

    expect(screen.getByRole("searchbox", { name: /search transcript/i })).toBeInTheDocument();
    expect(screen.getByText("Transcript · 3 aligned")).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /assign media to sentence/i })).toHaveLength(3);
    expect(screen.getByText("low conf")).toBeInTheDocument();
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(screen.queryByText("**Orphan** row.")).not.toBeInTheDocument();
  });

  it("highlights search matches", () => {
    renderPane({ query: "capital" });

    expect(screen.getByText("Capital", { selector: "mark" })).toBeInTheDocument();
  });

  it("click selects and seeks, while shift-click extends a contiguous range", () => {
    const props = renderPane({ selectedRange: [1, 1] });

    fireEvent.click(screen.getByRole("button", { name: /2 00:05 Low confidence sentence/i }));
    expect(props.onSelectRange).toHaveBeenLastCalledWith([2, 2]);
    expect(props.onSeek).toHaveBeenLastCalledWith(5);

    fireEvent.click(screen.getByRole("button", { name: /3 00:10 Orphan row/i }), { shiftKey: true });
    expect(props.onSelectRange).toHaveBeenLastCalledWith([1, 3]);
    expect(props.onSeek).toHaveBeenLastCalledWith(10);
  });

  it("opens the sentence menu from right-click and add handle", () => {
    const props = renderPane();

    fireEvent.contextMenu(screen.getByRole("button", { name: /1 00:00 Capitalism begins here/i }), { clientX: 30, clientY: 40 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /assign media to range/i }));
    expect(props.onAssignRange).toHaveBeenCalledWith([1, 1]);

    fireEvent.click(screen.getByRole("button", { name: "Assign media to sentence 2" }));
    expect(screen.getByRole("menuitem", { name: /play from here/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /merge s2 with next/i }));
    expect(props.onMergeNext).toHaveBeenCalledWith(2);
  });
});
