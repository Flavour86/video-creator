import { describe, expect, it } from "vitest";

import { buildFgItem, deleteVisualItem, hasSentenceOverlap, nextZIndex, patchBackgroundItems, patchVisualItem } from "./layers";
import type { Layer } from "./preview/resolveDisplay";

// ── hasSentenceOverlap ────────────────────────────────────────────────────────

describe("hasSentenceOverlap", () => {
  const items = [
    { id: "a", sentences: [3, 6] as [number, number] },
    { id: "b", sentences: [10, 12] as [number, number] },
  ];

  it("returns false when no items", () => {
    expect(hasSentenceOverlap([], 1, 5)).toBe(false);
  });

  it("returns false when range is entirely before all items", () => {
    expect(hasSentenceOverlap(items, 1, 2)).toBe(false);
  });

  it("returns false when range is entirely after all items", () => {
    expect(hasSentenceOverlap(items, 13, 15)).toBe(false);
  });

  it("returns true when range exactly matches an item", () => {
    expect(hasSentenceOverlap(items, 3, 6)).toBe(true);
  });

  it("returns true when range partially overlaps the start of an item", () => {
    expect(hasSentenceOverlap(items, 1, 4)).toBe(true);
  });

  it("returns true when range partially overlaps the end of an item", () => {
    expect(hasSentenceOverlap(items, 5, 8)).toBe(true);
  });

  it("returns true when range is contained within an item", () => {
    expect(hasSentenceOverlap(items, 4, 5)).toBe(true);
  });

  it("returns true when range contains an item entirely", () => {
    expect(hasSentenceOverlap(items, 1, 15)).toBe(true);
  });

  it("returns false when adjacent (touching) ranges do not overlap", () => {
    expect(hasSentenceOverlap(items, 7, 9)).toBe(false);
  });

  it("excludes item by id when excludeId is provided", () => {
    expect(hasSentenceOverlap(items, 3, 6, "a")).toBe(false);
  });

  it("still detects overlap from other items when excludeId is set", () => {
    expect(hasSentenceOverlap(items, 10, 11, "a")).toBe(true);
  });
});

// ── nextZIndex ────────────────────────────────────────────────────────────────

describe("nextZIndex", () => {
  it("returns 1 when no FG layers exist", () => {
    const layers: Layer[] = [];
    expect(nextZIndex(layers, "fg")).toBe(1);
  });

  it("returns 2 when one FG layer exists", () => {
    const layers: Layer[] = [{ id: "L1", kind: "fg", name: "Foreground · z1", items: [] }];
    expect(nextZIndex(layers, "fg")).toBe(2);
  });

  it("returns 3 when two FG layers exist", () => {
    const layers: Layer[] = [
      { id: "L1", kind: "fg", name: "Foreground · z1", items: [] },
      { id: "L2", kind: "fg", name: "Foreground · z2", items: [] },
    ];
    expect(nextZIndex(layers, "fg")).toBe(3);
  });

  it("counts PiP layers independently from FG layers", () => {
    const layers: Layer[] = [
      { id: "L1", kind: "fg", name: "Foreground · z1", items: [] },
      { id: "L2", kind: "pip", name: "PiP · z1", items: [] },
    ];
    expect(nextZIndex(layers, "pip")).toBe(2);
  });

  it("ignores bg and sub layers", () => {
    const layers: Layer[] = [
      { id: "L1", kind: "bg", name: "Background", items: [] },
      { id: "L2", kind: "sub", name: "Subtitles", items: [] },
    ];
    expect(nextZIndex(layers, "fg")).toBe(1);
  });
});

// ── buildFgItem ───────────────────────────────────────────────────────────────

describe("buildFgItem", () => {
  it("builds a correctly shaped FG item from params", () => {
    const item = buildFgItem({
      id: "item-1",
      mediaId: "img.jpg",
      from: 3,
      to: 5,
      startTime: 10.0,
      endTime: 25.5,
      motion: "ken_burns",
      easing: "ease_in_out",
      transIn: "fade",
      transOut: "cut",
    });

    expect(item).toEqual({
      id: "item-1",
      mediaId: "img.jpg",
      sentences: [3, 5],
      start: 10.0,
      end: 25.5,
      motion: { kind: "ken_burns", easing: "ease_in_out" },
      transitions: { in: "fade", out: "cut" },
    });
  });

  it("includes time anchor metadata when requested", () => {
    const item = buildFgItem({
      id: "item-1",
      mediaId: "img.jpg",
      from: 1,
      to: 1,
      startTime: 60,
      endTime: 75,
      anchor: "time",
      fromTime: "0:01:00.000",
      toTime: "0:01:15.000",
      motion: "none",
      easing: "linear",
      transIn: "cut",
      transOut: "cut",
    });

    expect(item).toMatchObject({
      anchor: "time",
      from: "0:01:00.000",
      to: "0:01:15.000",
      start: 60,
      end: 75,
    });
  });
});

describe("patchVisualItem", () => {
  const layers: Layer[] = [
    {
      id: "fg-z1",
      kind: "fg",
      name: "Foreground z1",
      items: [{
        id: "fg-1",
        mediaId: "fg.png",
        sentences: [1, 1],
        start: 0,
        end: 5,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        cache_status: "warm",
      }],
    },
    {
      id: "pip-z1",
      kind: "pip",
      name: "PiP z1",
      items: [{
        id: "pip-1",
        mediaId: "pip.png",
        sentences: [2, 2],
        start: 5,
        end: 10,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        cache_status: "warm",
        pip: { posX: 88, posY: 88, size: 30, radius: 8, opacity: 90 },
      }],
    },
  ];

  it("patches one selected item and marks only that item cache invalid", () => {
    const next = patchVisualItem(layers, "fg-z1", "fg-1", {
      motion: { kind: "ken_burns_strong" },
      transitions: { out: "fade" },
    });
    const fgItem = next[0]?.items[0] as { motion: { kind: string }; transitions: { out: string }; cache_status?: string };
    const pipItem = next[1]?.items[0] as { cache_status?: string };
    expect(fgItem.motion.kind).toBe("ken_burns_strong");
    expect(fgItem.transitions.out).toBe("fade");
    expect(fgItem.cache_status).toBe("invalid");
    expect(pipItem.cache_status).toBe("warm");
  });

  it("normalizes subtle motion alias to schema-valid ken_burns", () => {
    const next = patchVisualItem(layers, "fg-z1", "fg-1", {
      motion: { kind: "ken_burns_subtle" },
    });
    const fgItem = next[0]?.items[0] as { motion: { kind: string } };
    expect(fgItem.motion.kind).toBe("ken_burns");
  });
});

describe("patchBackgroundItems", () => {
  it("patches all background strips and invalidates their cache", () => {
    const layers: Layer[] = [{
      id: "bg-main",
      kind: "bg",
      name: "Background",
      items: [
        {
          id: "bg-1",
          mediaId: "bg-a.png",
          sentences: [1, 3],
          start: 0,
          end: 5,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "fade" },
          crossfade: 0.2,
          cache_status: "warm",
        },
        {
          id: "bg-2",
          mediaId: "bg-b.png",
          sentences: [1, 3],
          start: 5,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "fade", out: "cut" },
          crossfade: 0.2,
          cache_status: "warm",
        },
      ],
    }];
    const next = patchBackgroundItems(layers, "bg-main", {
      crossfade: 1.2,
      motion: { kind: "ken_burns_strong", easing: "ease_out" },
    });
    const first = next[0]?.items[0] as { crossfade: number; motion: { kind: string; easing: string }; cache_status?: string };
    const second = next[0]?.items[1] as { crossfade: number; motion: { kind: string; easing: string }; cache_status?: string };
    expect(first.crossfade).toBe(1.2);
    expect(second.crossfade).toBe(1.2);
    expect(first.motion.kind).toBe("ken_burns_strong");
    expect(second.motion.easing).toBe("ease_out");
    expect(first.cache_status).toBe("invalid");
    expect(second.cache_status).toBe("invalid");
  });

  it("normalizes subtle motion alias on background patches", () => {
    const layers: Layer[] = [{
      id: "bg-main",
      kind: "bg",
      name: "Background",
      items: [{
        id: "bg-1",
        mediaId: "bg-a.png",
        sentences: [1, 3],
        start: 0,
        end: 5,
        motion: { kind: "ken_burns", easing: "linear" },
        transitions: { in: "cut", out: "fade" },
        crossfade: 0.2,
        cache_status: "warm",
      }],
    }];
    const next = patchBackgroundItems(layers, "bg-main", {
      motion: { kind: "ken_burns_subtle" },
    });
    const first = next[0]?.items[0] as { motion: { kind: string } };
    expect(first.motion.kind).toBe("ken_burns");
  });
});

describe("deleteVisualItem", () => {
  it("removes a clip and prunes empty foreground layers", () => {
    const layers: Layer[] = [
      {
        id: "fg-z1",
        kind: "fg",
        name: "Foreground z1",
        items: [{
          id: "fg-1",
          mediaId: "fg.png",
          sentences: [1, 1],
          start: 0,
          end: 5,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
        }],
      },
      {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-1",
          mediaId: "bg.png",
          sentences: [1, 1],
          start: 0,
          end: 5,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
    ];
    const next = deleteVisualItem(layers, "fg-z1", "fg-1");
    expect(next.some((layer) => layer.id === "fg-z1")).toBe(false);
    expect(next.some((layer) => layer.id === "bg-main")).toBe(true);
  });
});
