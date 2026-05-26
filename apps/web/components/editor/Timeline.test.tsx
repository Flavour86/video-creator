import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { Timeline } from "./Timeline";

const LAYERS: Layer[] = [
  {
    id: "subtitles",
    kind: "sub",
    name: "Subtitles",
    items: [{ id: "sub-1", mediaId: "subs.srt", start: 0, end: 20, sentences: [1, 4] }],
  },
  {
    id: "pip-z1",
    kind: "pip",
    name: "PiP z1",
    items: [
      {
        id: "pip-1",
        mediaId: "pip-a.png",
        sentences: [1, 2],
        start: 2,
        end: 8,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        pip: { posX: 50, posY: 50, size: 30, radius: 12, opacity: 100 },
      },
      {
        id: "pip-2",
        mediaId: "pip-b.png",
        sentences: [2, 3],
        start: 4,
        end: 9,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        pip: { posX: 55, posY: 55, size: 30, radius: 12, opacity: 100 },
      },
    ],
  },
  {
    id: "fg-z1",
    kind: "fg",
    name: "Foreground z1",
    items: [
      {
        id: "fg-1",
        mediaId: "fg-a.png",
        sentences: [1, 1],
        start: 0,
        end: 4,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
      },
      {
        id: "fg-2",
        mediaId: "fg-b.png",
        sentences: [3, 3],
        start: 10,
        end: 14,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
      },
    ],
  },
  {
    id: "bg-main",
    kind: "bg",
    name: "Background",
    items: [{
      id: "bg-1",
      mediaId: "bg-a.png",
      sentences: [1, 4],
      start: 0,
      end: 20,
      motion: { kind: "none", easing: "linear" },
      transitions: { in: "cut", out: "cut" },
      crossfade: 0.6,
    }],
  },
];

const DRAG_LAYER: Layer[] = [{
  id: "fg-z1",
  kind: "fg",
  name: "Foreground z1",
  items: [{
    id: "fg-drag",
    mediaId: "fg-drag.png",
    sentences: [1, 1],
    start: 2,
    end: 7,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
  }],
}];

const SENTENCES = [
  { index: 1, text: "First subtitle.", start_s: 0, end_s: 4, confidence_avg: 0.95 },
  { index: 2, text: "Second subtitle.", start_s: 4, end_s: 8, confidence_avg: 0.94 },
  { index: 3, text: "Third subtitle.", start_s: 8, end_s: 12, confidence_avg: 0.93 },
  { index: 4, text: "Fourth subtitle.", start_s: 12, end_s: 16, confidence_avg: 0.92 },
];

function renderTimeline(overrides: Partial<ComponentProps<typeof Timeline>> = {}) {
  const onDeleteItem = vi.fn();
  const onSeek = vi.fn();
  const onSelect = vi.fn();
  const onUpdateClipTiming = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Timeline
        cacheLabel="cache 4/4"
        currentTime={0}
        duration={20}
        fps={30}
        layers={LAYERS}
        onDeleteItem={onDeleteItem}
        onSeek={onSeek}
        onSelect={onSelect}
        onUpdateClipTiming={onUpdateClipTiming}
        selected={{ layerId: "fg-z1", itemId: "fg-1" }}
        sentences={SENTENCES}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onDeleteItem, onSeek, onSelect, onUpdateClipTiming };
}

describe("Timeline", () => {
  it("shows 30 fps, clip count/cache metadata, and full-width waveform", () => {
    renderTimeline();
    expect(screen.getByText(/30 fps/i)).toBeInTheDocument();
    expect(screen.getByText(/5 clips/i)).toBeInTheDocument();
    expect(screen.getByText(/cache 4\/4/i)).toBeInTheDocument();
    expect(screen.getByTestId("timeline-waveform")).toHaveClass("inset-x-0");
  });

  it("packs overlapping PiP clips into separate rows and keeps non-overlap FG clips in one row", () => {
    renderTimeline();
    expect(screen.getAllByTestId("timeline-row-pip")).toHaveLength(2);
    expect(screen.getAllByTestId("timeline-row-fg")).toHaveLength(1);
  });

  it("shows a dedicated background row when a background layer exists", () => {
    renderTimeline();
    expect(screen.getByTestId("timeline-row-bg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bg-a\.png over s1-s4$/i })).toBeInTheDocument();
  });

  it("supports body drag and grip resize with timeline constraints", () => {
    const { onUpdateClipTiming } = renderTimeline({
      duration: 10,
      layers: DRAG_LAYER,
      selected: { layerId: "fg-z1", itemId: "fg-drag" },
    });
    const clip = screen.getByRole("button", { name: "fg-drag.png over s1" });

    fireEvent.mouseDown(clip, { clientX: 80 });
    fireEvent.mouseMove(window, { clientX: -500 });
    fireEvent.mouseUp(window);
    const movePatch = onUpdateClipTiming.mock.calls.at(-1)?.[0] as { start: number; end: number };
    expect(movePatch.start).toBe(0);
    expect(movePatch.end).toBe(5);

    onUpdateClipTiming.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", { name: /Resize end fg-drag.png over s1/i }), { clientX: 80 });
    fireEvent.mouseMove(window, { clientX: -500 });
    fireEvent.mouseUp(window);
    const endPatch = onUpdateClipTiming.mock.calls.at(-1)?.[0] as { start: number; end: number };
    expect(endPatch.start).toBeCloseTo(2, 4);
    expect(endPatch.end).toBeCloseTo(2.5, 4);

    onUpdateClipTiming.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", { name: /Resize start fg-drag.png over s1/i }), { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 500 });
    fireEvent.mouseUp(window);
    const startPatch = onUpdateClipTiming.mock.calls.at(-1)?.[0] as { start: number; end: number };
    expect(startPatch.start).toBeCloseTo(6.5, 4);
    expect(startPatch.end).toBeCloseTo(7, 4);
  });

  it("renders aligned subtitle cues but does not allow drag/resize edits", () => {
    const { onUpdateClipTiming } = renderTimeline({
      layers: [LAYERS[0] as Layer],
      selected: { layerId: "subtitles", itemId: "subtitles-s1" },
    });
    const clip = screen.getByRole("button", { name: "s1 over s1" });

    expect(screen.queryByRole("button", { name: /Resize start s1 over s1/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resize end s1 over s1/i })).not.toBeInTheDocument();
    fireEvent.mouseDown(clip, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 25 });
    fireEvent.mouseUp(window, { clientX: 25 });
    expect(onUpdateClipTiming).not.toHaveBeenCalled();
    expect(clip).toBeInTheDocument();
  });

  it("does not select subtitle clips on click", () => {
    const { onSelect } = renderTimeline({
      layers: [LAYERS[0] as Layer],
      selected: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "s1 over s1" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows clip x delete for non-background clips only", () => {
    const { onDeleteItem } = renderTimeline();
    fireEvent.click(screen.getByRole("button", { name: /Delete pip-a.png over s1-s2/i }));
    expect(onDeleteItem).toHaveBeenCalledWith({ itemId: "pip-1", layerId: "pip-z1" });
    expect(screen.queryByRole("button", { name: /Delete bg-a.png over s1-s4/i })).not.toBeInTheDocument();
  });

  it("handles timeline drag at 100 clips within the frame budget", () => {
    const manyClips: Layer[] = [{
      id: "fg-z1",
      kind: "fg",
      name: "Foreground z1",
      items: Array.from({ length: 100 }, (_, index) => ({
        id: `fg-${index}`,
        mediaId: `fg-${index}.png`,
        sentences: [index + 1, index + 1] as [number, number],
        start: index,
        end: index + 0.75,
        motion: { kind: "none", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
      })),
    }];
    const { onUpdateClipTiming } = renderTimeline({
      duration: 120,
      layers: manyClips,
      selected: { layerId: "fg-z1", itemId: "fg-50" },
    });
    const clip = screen.getByRole("button", { name: "fg-50.png over s51" });

    const startedAt = performance.now();
    fireEvent.mouseDown(clip, { clientX: 50 });
    fireEvent.mouseMove(window, { clientX: 60 });
    fireEvent.mouseUp(window, { clientX: 60 });
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(16);
    expect(onUpdateClipTiming).toHaveBeenCalledWith(expect.objectContaining({ itemId: "fg-50", layerId: "fg-z1" }));
  });

  it("keeps a background row visible for mediaIds-only playlist items", () => {
    const backgroundPlaylistOnly: Layer[] = [{
      id: "bg-main",
      kind: "bg",
      name: "Background",
      items: [{
        id: "bg-playlist",
        mediaIds: ["bg0.png", "bg1.png", "bg2.png"],
      }],
    } as unknown as Layer];
    renderTimeline({
      duration: 60,
      layers: backgroundPlaylistOnly,
      selected: { layerId: "bg-main", itemId: "bg-playlist" },
      sentences: [],
    });
    expect(screen.getByTestId("timeline-row-bg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auto / 3 assets" })).toBeInTheDocument();
  });
});
