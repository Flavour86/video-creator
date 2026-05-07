import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TimelineTrack } from "./TimelineTrack";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

const SENTENCES: AlignedSentence[] = [
  { index: 1, text: "Hello.", start_s: 0, end_s: 5, confidence_avg: 0.9 },
  { index: 2, text: "World.", start_s: 5, end_s: 10, confidence_avg: 0.8 },
];

const BG_LAYER: Extract<Layer, { kind: "bg" }> = {
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
    sentences: [1, 2],
  }],
};

const SUB_LAYER: Layer = { id: "sub-1", kind: "sub", name: "Subtitles", items: [] };

it("renders the layer name label", () => {
  render(
    <TimelineTrack
      currentTime={0}
      duration={10}
      layer={SUB_LAYER}
      sentences={SENTENCES}
    />,
  );
  expect(screen.getByText("Subtitles")).toBeInTheDocument();
});

it("renders sentence chips for sub layer", () => {
  render(
    <TimelineTrack
      currentTime={0}
      duration={10}
      layer={SUB_LAYER}
      sentences={SENTENCES}
    />,
  );
  expect(screen.getByText("s1")).toBeInTheDocument();
  expect(screen.getByText("s2")).toBeInTheDocument();
});

it("renders mediaId label for bg layer", () => {
  render(
    <TimelineTrack
      currentTime={0}
      duration={10}
      layer={BG_LAYER}
    />,
  );
  expect(screen.getByText("bg.jpg")).toBeInTheDocument();
});

it("renders playhead at correct position", () => {
  const { container } = render(
    <TimelineTrack
      currentTime={5}
      duration={10}
      layer={SUB_LAYER}
      sentences={[]}
    />,
  );
  const playhead = container.querySelector(".bg-amber-400\\/70") as HTMLElement;
  expect(playhead).toBeTruthy();
  expect(playhead.style.left).toBe("50%");
});
