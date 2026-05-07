import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { Timeline } from "./Timeline";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

const SENTENCES: AlignedSentence[] = [
  { index: 1, text: "Hello.", start_s: 0, end_s: 1, confidence_avg: 0.9 },
];

const BG: Layer = {
  id: "bg-1",
  kind: "bg",
  name: "Background",
  items: [{
    id: "item-1",
    mediaId: "bg.jpg",
    start: 0,
    end: 10,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    crossfade: 0,
    sentences: [1, 1],
  }],
};

const SUB: Layer = { id: "sub-1", kind: "sub", name: "Subtitles", items: [] };

it("renders Timeline header", () => {
  render(
    <Timeline
      currentTime={0}
      duration={10}
      layers={[]}
      onSeek={vi.fn()}
      projectPath="/p"
      sentences={[]}
    />,
  );
  expect(screen.getByText("Timeline")).toBeInTheDocument();
});

it("shows duration in header", () => {
  render(
    <Timeline
      currentTime={0}
      duration={90}
      layers={[]}
      onSeek={vi.fn()}
      projectPath="/p"
      sentences={[]}
    />,
  );
  expect(screen.getByText(/1:30.*30 fps/)).toBeInTheDocument();
});

it("renders track rows for provided layers", () => {
  render(
    <Timeline
      currentTime={0}
      duration={10}
      layers={[BG, SUB]}
      onSeek={vi.fn()}
      projectPath="/p"
      sentences={[]}
    />,
  );
  expect(screen.getByText("Background")).toBeInTheDocument();
  expect(screen.getByText("Subtitles")).toBeInTheDocument();
});

it("injects Subtitles placeholder row when alignment exists but no sub layer", () => {
  render(
    <Timeline
      currentTime={0}
      duration={10}
      layers={[BG]}
      onSeek={vi.fn()}
      projectPath="/p"
      sentences={SENTENCES}
    />,
  );
  expect(screen.getByText("Subtitles")).toBeInTheDocument();
});

it("does not inject placeholder when no sentences", () => {
  render(
    <Timeline
      currentTime={0}
      duration={10}
      layers={[BG]}
      onSeek={vi.fn()}
      projectPath="/p"
      sentences={[]}
    />,
  );
  expect(screen.queryByText("Subtitles")).not.toBeInTheDocument();
});

it("shows No layers yet when empty", () => {
  render(
    <Timeline
      currentTime={0}
      duration={0}
      layers={[]}
      onSeek={vi.fn()}
      projectPath=""
      sentences={[]}
    />,
  );
  expect(screen.getByText(/No layers yet/)).toBeInTheDocument();
});
