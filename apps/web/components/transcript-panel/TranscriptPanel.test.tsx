import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

import { TranscriptPanel } from "./TranscriptPanel";
import type { AlignmentResult } from "@/lib/hooks/useAlignment";

const RESULT: AlignmentResult = {
  sentences: [
    { index: 1, text: "Hello world.", start_s: 0, end_s: 1.5, confidence_avg: 0.9 },
    { index: 2, text: "Goodbye.", start_s: 1.6, end_s: 2.2, confidence_avg: 0.8 },
  ],
  words: [],
  cache_hit: false,
};

it("renders all sentences", () => {
  render(
    <TranscriptPanel
      currentTime={0}
      onSelect={vi.fn()}
      result={RESULT}
      selected={new Set()}
    />,
  );
  expect(screen.getByText("Hello world.")).toBeInTheDocument();
  expect(screen.getByText("Goodbye.")).toBeInTheDocument();
});

it("renders sentence index numbers", () => {
  render(
    <TranscriptPanel
      currentTime={0}
      onSelect={vi.fn()}
      result={RESULT}
      selected={new Set()}
    />,
  );
  expect(screen.getByText("1")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

it("renders start timestamps", () => {
  render(
    <TranscriptPanel
      currentTime={0}
      onSelect={vi.fn()}
      result={RESULT}
      selected={new Set()}
    />,
  );
  // fmtTime(0) = "0:00.0", fmtTime(1.6) = "0:01.6"
  expect(screen.getByText("0:00.0")).toBeInTheDocument();
  expect(screen.getByText("0:01.6")).toBeInTheDocument();
});

describe("click behaviour", () => {
  it("calls onSelect with index and modifier flags on click", () => {
    const onSelect = vi.fn();
    render(
      <TranscriptPanel
        currentTime={0}
        onSelect={onSelect}
        result={RESULT}
        selected={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("Hello world."), { shiftKey: false, ctrlKey: false });
    expect(onSelect).toHaveBeenCalledWith(1, false, false);
  });

  it("passes shiftKey=true when shift is held", () => {
    const onSelect = vi.fn();
    render(
      <TranscriptPanel currentTime={0} onSelect={onSelect} result={RESULT} selected={new Set()} />,
    );
    fireEvent.click(screen.getByText("Goodbye."), { shiftKey: true, ctrlKey: false });
    expect(onSelect).toHaveBeenCalledWith(2, true, false);
  });

  it("calls onSeek with sentence start_s on click", () => {
    const onSeek = vi.fn();
    render(
      <TranscriptPanel
        currentTime={0}
        onSelect={vi.fn()}
        onSeek={onSeek}
        result={RESULT}
        selected={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("Goodbye."));
    expect(onSeek).toHaveBeenCalledWith(1.6);
  });
});

it("applies active styling to sentence matching currentTime", () => {
  const { container } = render(
    <TranscriptPanel
      currentTime={0.5}
      onSelect={vi.fn()}
      result={RESULT}
      selected={new Set()}
    />,
  );
  // Active sentence button has border-l-2 class
  const buttons = container.querySelectorAll("button");
  expect(buttons[0].className).toContain("border-l-2");
});
