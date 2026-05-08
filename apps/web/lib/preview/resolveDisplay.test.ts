import { describe, expect, it } from "vitest";
import { resolveDisplay } from "./resolveDisplay";
import type { Layer } from "./resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

const BG_LAYER: Layer = {
  id: "L-bg",
  kind: "bg",
  name: "Background",
  items: [
    {
      id: "bg-1",
      mediaId: "sky.jpg",
      sentences: [1, 5],
      start: 0,
      end: 60,
      motion: { kind: "none", easing: "linear" },
      transitions: { in: "cut", out: "cut" },
      crossfade: 0,
    },
  ],
};

const FG_LAYER: Layer = {
  id: "L-fg",
  kind: "fg",
  name: "Foreground",
  items: [
    {
      id: "fg-1",
      mediaId: "dog.jpg",
      sentences: [2, 3],
      start: 5,
      end: 20,
      motion: { kind: "none", easing: "linear" },
      transitions: { in: "cut", out: "cut" },
    },
  ],
};

const SENTENCES: AlignedSentence[] = [
  { index: 1, text: "Hello.", start_s: 0, end_s: 5, confidence_avg: 0.9 },
  { index: 2, text: "World.", start_s: 5, end_s: 12, confidence_avg: 0.9 },
  { index: 3, text: "Goodbye.", start_s: 12, end_s: 20, confidence_avg: 0.9 },
];

describe("resolveDisplay", () => {
  it("returns empty fg/pip and no bg when no layers", () => {
    const spec = resolveDisplay([], [], 0);
    expect(spec.fg).toEqual([]);
    expect(spec.pip).toEqual([]);
    expect(spec.bg).toBeUndefined();
  });

  it("uses the active bg item for the current time", () => {
    expect(resolveDisplay([BG_LAYER], [], 0).bg?.mediaId).toBe("sky.jpg");
    expect(resolveDisplay([BG_LAYER], [], 30).bg?.mediaId).toBe("sky.jpg");
    expect(resolveDisplay([BG_LAYER], [], 59.9).bg?.mediaId).toBe("sky.jpg");
  });

  it("rotates through multiple bg items by timestamp", () => {
    const layer = {
      ...BG_LAYER,
      items: [
        { ...BG_LAYER.items[0], id: "bg-1", mediaId: "one.jpg", start: 0, end: 5 },
        { ...BG_LAYER.items[0], id: "bg-2", mediaId: "two.jpg", start: 5, end: 10 },
      ],
    };

    expect(resolveDisplay([layer], [], 2).bg?.mediaId).toBe("one.jpg");
    expect(resolveDisplay([layer], [], 7).bg?.mediaId).toBe("two.jpg");
  });

  it("includes fg item when currentTime is within its range", () => {
    const spec = resolveDisplay([BG_LAYER, FG_LAYER], [], 10);
    expect(spec.fg).toHaveLength(1);
    expect(spec.fg[0].mediaId).toBe("dog.jpg");
  });

  it("excludes fg item when currentTime is outside its range", () => {
    const spec = resolveDisplay([BG_LAYER, FG_LAYER], [], 25);
    expect(spec.fg).toHaveLength(0);
  });

  it("fg item at exact start boundary is included", () => {
    const spec = resolveDisplay([BG_LAYER, FG_LAYER], [], 5);
    expect(spec.fg).toHaveLength(1);
  });

  it("fg item at exact end boundary is excluded", () => {
    const spec = resolveDisplay([BG_LAYER, FG_LAYER], [], 20);
    expect(spec.fg).toHaveLength(0);
  });

  it("returns subtitle text for the sentence containing currentTime", () => {
    const spec = resolveDisplay([BG_LAYER], SENTENCES, 7);
    expect(spec.subtitle?.text).toBe("World.");
  });

  it("returns no subtitle when between sentences", () => {
    const noGapSentences: AlignedSentence[] = [
      { index: 1, text: "A.", start_s: 0, end_s: 5, confidence_avg: 0.9 },
      { index: 2, text: "B.", start_s: 10, end_s: 15, confidence_avg: 0.9 },
    ];
    const spec = resolveDisplay([], noGapSentences, 7);
    expect(spec.subtitle).toBeUndefined();
  });

  it("bg opacity is 1 by default (cut transition)", () => {
    const spec = resolveDisplay([BG_LAYER], [], 10);
    expect(spec.bg?.opacity).toBe(1);
  });

  it("multiple fg layers each contribute their active item", () => {
    const fg2: Layer = {
      id: "L-fg2",
      kind: "fg",
      name: "Foreground 2",
      items: [{ id: "fg2-1", mediaId: "cat.jpg", sentences: [1, 2], start: 30, end: 45, motion: { kind: "none", easing: "linear" }, transitions: { in: "cut", out: "cut" } }],
    };
    const spec = resolveDisplay([BG_LAYER, FG_LAYER, fg2], [], 35);
    expect(spec.fg).toHaveLength(1);
    expect(spec.fg[0].mediaId).toBe("cat.jpg");
  });

  it("returns nested PiP placement for active pip item", () => {
    const pipLayer: Layer = {
      id: "L-pip",
      kind: "pip",
      name: "PiP",
      items: [
        {
          id: "pip-1",
          mediaId: "chart.jpg",
          sentences: [1, 1],
          start: 0,
          end: 10,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          pip: { posX: 98, posY: 2, size: 22, radius: 16, opacity: 90 },
        },
      ],
    };

    const spec = resolveDisplay([pipLayer], [], 5);
    expect(spec.pip[0].placement.posX).toBe(98);
    expect(spec.pip[0].placement.opacity).toBe(90);
  });
});
