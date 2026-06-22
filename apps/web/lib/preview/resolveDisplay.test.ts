import { describe, expect, it } from "vitest";
import { resolveDisplay } from "./resolveDisplay";
import type { Layer } from "./resolveDisplay";
import { formatBackgroundTime, normalizeBackgroundSchedule, parseBackgroundTime } from "./backgroundSchedule";
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

  it("rotates a single mediaIds background playlist without splitting timeline items", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [
        {
          id: base.id,
          mediaIds: ["one.jpg", "two.jpg", "three.jpg"],
          sentences: base.sentences,
          start: 0,
          end: 30,
          motion: base.motion,
          transitions: base.transitions,
          crossfade: base.crossfade,
        },
      ],
    };

    expect(resolveDisplay([layer], [], 2).bg?.mediaId).toBe("one.jpg");
    expect(resolveDisplay([layer], [], 12).bg?.mediaId).toBe("two.jpg");
    expect(resolveDisplay([layer], [], 22).bg?.mediaId).toBe("three.jpg");
  });

  it("parses and formats explicit background schedule time inputs", () => {
    expect(parseBackgroundTime("01:10")).toBe(70);
    expect(parseBackgroundTime("01:02:03")).toBe(3723);
    expect(parseBackgroundTime("12.5")).toBe(12.5);
    expect(parseBackgroundTime("1:99")).toBeNull();
    expect(parseBackgroundTime("-1")).toBeNull();

    expect(formatBackgroundTime(70)).toBe("01:10");
    expect(formatBackgroundTime(3723)).toBe("01:02:03");
  });

  it("normalizes schedule rows against mediaIds order and drops invalid rows", () => {
    expect(normalizeBackgroundSchedule([
      { id: "seg-two", mediaId: "two.jpg", start: 5, end: 10, lockedDuration: true },
      { id: "seg-missing", mediaId: "missing.jpg", start: 10, end: 20, lockedDuration: false },
      { id: "seg-one", mediaId: "one.jpg", start: 0, end: 5, lockedDuration: false },
      { id: "seg-zero", mediaId: "three.jpg", start: 20, end: 20, lockedDuration: false },
      { id: "seg-bad", mediaId: "three.jpg", start: 22, end: 20, lockedDuration: false },
    ], ["one.jpg", "two.jpg", "three.jpg"])).toEqual([
      { id: "seg-one", mediaId: "one.jpg", start: 0, end: 5, lockedDuration: false },
      { id: "seg-two", mediaId: "two.jpg", start: 5, end: 10, lockedDuration: true },
      { id: "seg-zero", mediaId: "three.jpg", start: 20, end: 20, lockedDuration: false },
    ]);
  });

  it("uses explicit background schedule ranges instead of even playlist split", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [
        {
          id: base.id,
          mediaIds: ["one.jpg", "two.jpg", "three.jpg"],
          schedule: [
            { id: "seg-one", mediaId: "one.jpg", start: 0, end: 3, lockedDuration: false },
            { id: "seg-two", mediaId: "two.jpg", start: 3, end: 8, lockedDuration: false },
            { id: "seg-three", mediaId: "three.jpg", start: 8, end: 30, lockedDuration: false },
          ],
          sentences: base.sentences,
          start: 0,
          end: 30,
          motion: base.motion,
          transitions: base.transitions,
          crossfade: base.crossfade,
        },
      ],
    };

    expect(resolveDisplay([layer], [], 2).bg?.mediaId).toBe("one.jpg");
    expect(resolveDisplay([layer], [], 4).bg?.mediaId).toBe("two.jpg");
    expect(resolveDisplay([layer], [], 4).bg?.sourceTime).toBe(1);
    expect(resolveDisplay([layer], [], 20).bg?.mediaId).toBe("three.jpg");
  });

  it("does not fall back to a playlist inside a manual background schedule gap", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["one.jpg", "two.jpg", "three.jpg"],
        schedule: [
          { id: "seg-one", mediaId: "one.jpg", start: 0, end: 3, lockedDuration: false },
          { id: "seg-three", mediaId: "three.jpg", start: 8, end: 12, lockedDuration: false },
        ],
        start: 0,
        end: 30,
      }],
    };

    expect(resolveDisplay([layer], [], 2).bg?.mediaId).toBe("one.jpg");
    expect(resolveDisplay([layer], [], 5).bg).toBeUndefined();
    expect(resolveDisplay([layer], [], 10).bg?.mediaId).toBe("three.jpg");
  });

  it("treats a zero-duration background schedule as manual no-background intent", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["one.jpg", "two.jpg"],
        schedule: [
          { id: "seg-zero", mediaId: "one.jpg", start: 0, end: 0, lockedDuration: false },
        ],
        start: 0,
        end: 30,
      }],
    };

    expect(resolveDisplay([layer], [], 2).bg).toBeUndefined();
    expect(resolveDisplay([layer], [], 2).backgrounds).toEqual([]);
  });

  it("treats an empty explicit background schedule as manual no-background intent", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["one.jpg", "two.jpg"],
        schedule: [],
        start: 0,
        end: 30,
      }],
    };

    expect(resolveDisplay([layer], [], 2).bg).toBeUndefined();
    expect(resolveDisplay([layer], [], 2).backgrounds).toEqual([]);
  });

  it("uses media durations for video background playlists and falls back to black after a short playlist", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["intro.mp4", "outro.mp4"],
        start: 0,
        end: 12,
      }],
    };
    const media = [
      { filename: "intro.mp4", kind: "video", mediaId: "intro.mp4", duration: 4 },
      { filename: "outro.mp4", kind: "video", mediaId: "outro.mp4", duration: 3 },
    ];

    expect(resolveDisplay([layer], [], 3.9, { media }).bg?.mediaId).toBe("intro.mp4");
    expect(resolveDisplay([layer], [], 3.9, { media }).bg?.sourceTime).toBeCloseTo(3.9);
    expect(resolveDisplay([layer], [], 4, { media }).bg?.mediaId).toBe("outro.mp4");
    expect(resolveDisplay([layer], [], 4.5, { media }).bg?.sourceTime).toBeCloseTo(0.5);
    expect(resolveDisplay([layer], [], 6.9, { media }).bg?.mediaId).toBe("outro.mp4");
    expect(resolveDisplay([layer], [], 7, { media }).bg).toBeUndefined();
  });

  it("uses the media duration for a single video background and falls back to black", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: "intro.mp4",
        mediaIds: undefined,
        start: 0,
        end: 10,
      }],
    };
    const media = [{ filename: "intro.mp4", kind: "video", mediaId: "intro.mp4", duration: 4 }];

    expect(resolveDisplay([layer], [], 3, { media }).bg?.mediaId).toBe("intro.mp4");
    expect(resolveDisplay([layer], [], 3, { media }).bg?.sourceTime).toBe(3);
    expect(resolveDisplay([layer], [], 5, { media }).bg).toBeUndefined();
  });

  it("uses video metadata for stable background media ids without video extensions", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: "upload-video-bg-1",
        mediaIds: undefined,
        start: 2,
        end: 12,
      }],
    };
    const media = [{ filename: "uploaded-video.mp4", kind: "video", mediaId: "upload-video-bg-1", duration: 4 }];

    expect(resolveDisplay([layer], [], 5, { media }).bg).toMatchObject({
      mediaId: "upload-video-bg-1",
      opacity: 1,
      sourceTime: 3,
    });
    expect(resolveDisplay([layer], [], 7, { media }).bg).toBeUndefined();
  });

  it("returns both background images during the crossfade overlap", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["one.jpg", "two.jpg"],
        start: 0,
        end: 10,
        crossfade: 1,
      }],
    };

    const spec = resolveDisplay([layer], [], 4.5);

    expect(spec.backgrounds.map((entry) => entry.mediaId)).toEqual(["one.jpg", "two.jpg"]);
    expect(spec.backgrounds[0].opacity).toBeCloseTo(0.5);
    expect(spec.backgrounds[1].opacity).toBeCloseTo(0.5);
  });

  it("keeps scheduled background rows on exact manual boundaries", () => {
    const base = BG_LAYER.items[0]!;
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...base,
        mediaId: undefined,
        mediaIds: ["one.jpg", "two.jpg"],
        schedule: [
          { id: "seg-one", mediaId: "one.jpg", start: 0, end: 5, lockedDuration: false },
          { id: "seg-two", mediaId: "two.jpg", start: 5, end: 10, lockedDuration: false },
        ],
        start: 0,
        end: 10,
        motion: { kind: "ken_burns", easing: "ease_in" },
        crossfade: 1,
      }],
    };

    const beforeBoundary = resolveDisplay([layer], [], 4.5);
    const atBoundary = resolveDisplay([layer], [], 5);

    expect(beforeBoundary.backgrounds.map((entry) => entry.mediaId)).toEqual(["one.jpg"]);
    expect(beforeBoundary.backgrounds[0].opacity).toBe(1);
    expect(atBoundary.backgrounds.map((entry) => entry.mediaId)).toEqual(["two.jpg"]);
    expect(atBoundary.backgrounds[0].opacity).toBe(1);
    expect(atBoundary.backgrounds[0].sourceTime).toBe(0);
    expect(atBoundary.backgrounds[0].motion).toEqual({ kind: "ken_burns", easing: "ease_in" });
  });

  it("includes fg item when currentTime is within its range", () => {
    const spec = resolveDisplay([BG_LAYER, FG_LAYER], [], 10);
    expect(spec.fg).toHaveLength(1);
    expect(spec.fg[0].mediaId).toBe("dog.jpg");
    expect(spec.fg[0].itemId).toBe("fg-1");
    expect(spec.fg[0].layerId).toBe("L-fg");
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

  it("returns active foreground items in bottom-to-top layer order", () => {
    const fgTop: Layer = {
      id: "L-fg-top",
      kind: "fg",
      name: "Foreground top",
      items: [{
        id: "fg-top",
        mediaId: "top.jpg",
        sentences: [1, 1],
        start: 0,
        end: 10,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
      }],
    };
    const fgBottom: Layer = {
      id: "L-fg-bottom",
      kind: "fg",
      name: "Foreground bottom",
      items: [{
        id: "fg-bottom",
        mediaId: "bottom.jpg",
        sentences: [1, 1],
        start: 0,
        end: 10,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
      }],
    };

    const spec = resolveDisplay([fgTop, fgBottom], [], 5);
    expect(spec.fg.map((item) => item.mediaId)).toEqual(["bottom.jpg", "top.jpg"]);
  });

  it("returns active pip items in bottom-to-top layer order", () => {
    const pipTop: Layer = {
      id: "L-pip-top",
      kind: "pip",
      name: "PiP top",
      items: [{
        id: "pip-top",
        mediaId: "pip-top.jpg",
        sentences: [1, 1],
        start: 0,
        end: 10,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        pip: { posX: 70, posY: 10, size: 30, radius: 12, opacity: 100 },
      }],
    };
    const pipBottom: Layer = {
      id: "L-pip-bottom",
      kind: "pip",
      name: "PiP bottom",
      items: [{
        id: "pip-bottom",
        mediaId: "pip-bottom.jpg",
        sentences: [1, 1],
        start: 0,
        end: 10,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        pip: { posX: 10, posY: 70, size: 30, radius: 12, opacity: 100 },
      }],
    };

    const spec = resolveDisplay([pipTop, pipBottom], [], 5);
    expect(spec.pip.map((item) => item.mediaId)).toEqual(["pip-bottom.jpg", "pip-top.jpg"]);
  });

  it("keeps foreground and PiP motion progress for canvas rendering", () => {
    const fgLayer: Layer = {
      ...FG_LAYER,
      items: [{
        ...FG_LAYER.items[0]!,
        motion: { kind: "pan_left", easing: "ease_out" },
      }],
    };
    const pipLayer: Layer = {
      id: "L-pip",
      kind: "pip",
      name: "PiP",
      items: [{
        id: "pip-1",
        mediaId: "pip.jpg",
        sentences: [1, 1],
        start: 5,
        end: 20,
        motion: { kind: "zoom_in", easing: "ease_in" },
        transitions: { in: "cut", out: "cut" },
        pip: { posX: 10, posY: 10, size: 30, radius: 8, opacity: 90 },
      }],
    };

    const spec = resolveDisplay([fgLayer, pipLayer], [], 12.5);

    expect(spec.fg[0].motion).toEqual({ kind: "pan_left", easing: "ease_out" });
    expect(spec.fg[0].motionProgress).toBeCloseTo(0.75);
    expect(spec.pip[0].motion).toEqual({ kind: "zoom_in", easing: "ease_in" });
    expect(spec.pip[0].motionProgress).toBeCloseTo(0.25);
  });

  it("approximates slide transitions with translateX", () => {
    const layer: Layer = {
      ...FG_LAYER,
      items: [
        {
          ...FG_LAYER.items[0],
          start: 5,
          end: 20,
          transitions: { in: "slide_right", out: "slide_left" },
        },
      ],
    };

    expect(resolveDisplay([layer], [], 5).fg[0].translateX).toBe(-100);
    const transition = resolveDisplay([layer], [], 5.2).fg[0].transition;
    expect(transition.duration).toBe(0.4);
    expect(transition.kind).toBe("slide_right");
    expect(transition.phase).toBe("in");
    expect(transition.progress).toBeCloseTo(0.5);
    expect(resolveDisplay([layer], [], 5.2).fg[0].translateX).toBeCloseTo(-50);
    expect(resolveDisplay([layer], [], 10).fg[0].translateX).toBe(0);
    expect(resolveDisplay([layer], [], 19.75).fg[0].translateX).toBeLessThan(0);
  });

  it("uses the export transition default even when a background crossfade is zero", () => {
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...BG_LAYER.items[0]!,
        transitions: { in: "fade", out: "cut" },
        crossfade: 0,
      }],
    };

    const spec = resolveDisplay([layer], [], 0.2);

    expect(spec.bg?.opacity).toBeCloseTo(0.5);
    expect(spec.bg?.transition).toEqual({
      duration: 0.4,
      kind: "fade",
      phase: "in",
      progress: 0.5,
    });
  });
});
