import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import type { ComponentProps, ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { PreviewSurface } from "./PreviewSurface";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const BG_LAYER: Layer = {
  id: "bg-main",
  kind: "bg",
  name: "Background",
  items: [{
    id: "bg-1",
    mediaId: "bg0.png",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    crossfade: 0.6,
  }],
};

const BG_VIDEO_LAYER: Layer = {
  id: "bg-video",
  kind: "bg",
  name: "Background Video",
  items: [{
    id: "bg-v-1",
    mediaId: "bg0.mp4",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    crossfade: 0.6,
  }],
};

const FG_LAYER: Layer = {
  id: "fg-main",
  kind: "fg",
  name: "Foreground",
  items: [{
    id: "fg-1",
    mediaId: "fg0.png",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
  }],
};

const FG_LAYER_LATE: Layer = {
  id: "fg-late",
  kind: "fg",
  name: "Foreground Late",
  items: [{
    id: "fg-late-1",
    mediaId: "fg-late.png",
    sentences: [1, 1],
    start: 5,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
  }],
};

const FG_VIDEO_LAYER: Layer = {
  id: "fg-video",
  kind: "fg",
  name: "Foreground Video",
  items: [{
    id: "fg-v-1",
    mediaId: "fg0.mov",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "fade", out: "cut" },
  }],
};

const PIP_LAYER: Layer = {
  id: "pip-main",
  kind: "pip",
  name: "PiP",
  items: [{
    id: "pip-1",
    mediaId: "pip0.png",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    pip: { posX: 70, posY: 10, size: 30, radius: 10, opacity: 80 },
  }],
};

const PIP_VIDEO_LAYER: Layer = {
  id: "pip-video",
  kind: "pip",
  name: "PiP Video",
  items: [{
    id: "pip-v-1",
    mediaId: "pip0.webm",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "fade", out: "cut" },
    pip: { posX: 15, posY: 70, size: 28, radius: 8, opacity: 100 },
  }],
};

const SENTENCES: AlignedSentence[] = [
  { index: 1, text: "Capitalism begins here.", start_s: 0, end_s: 10, confidence_avg: 0.9 },
];

const SUBTITLES_ON: Project["subtitles"] = {
  burn_in: true,
  style: {
    bg_style: "pill",
    font: "Helvetica Neue",
    max_chars_per_line: 30,
    position: "top",
    size: 36,
  },
};

const WATERMARK_ON: Project["watermark"] = {
  mediaId: "logo.png",
  opacity: 90,
  posX: 90,
  posY: 10,
  scale: 0.08,
};
const WATERMARK_VIDEO_ON: Project["watermark"] = {
  mediaId: "logo.mov",
  opacity: 90,
  posX: 90,
  posY: 10,
  scale: 0.08,
};

const drawImage = vi.fn();
const fillRect = vi.fn();
const fillText = vi.fn();
const roundRect = vi.fn();
const beginPath = vi.fn();
const clip = vi.fn();
const fill = vi.fn();

const fakeContext = {
  beginPath,
  clip,
  clearRect: vi.fn(),
  drawImage,
  fill,
  fillRect,
  fillText,
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  restore: vi.fn(),
  roundRect,
  save: vi.fn(),
  strokeText: vi.fn(),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSurface(overrides: Partial<ComponentProps<typeof PreviewSurface>> = {}) {
  const props: ComponentProps<typeof PreviewSurface> = {
    currentTime: 0,
    duration: 20,
    layers: [],
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onTogglePlay: vi.fn(),
    playing: false,
    projectPath: "E:/projects/test01",
    resolution: "1080p",
    sentences: SENTENCES,
    subtitles: null,
    watermark: null,
    ...overrides,
  };
  return {
    props,
    ...render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} />
      </NextIntlClientProvider>,
    ),
  };
}

function filenameFromSource(source: unknown): string | null {
  if (!(source instanceof HTMLImageElement || source instanceof HTMLVideoElement)) {
    return null;
  }
  try {
    const url = new URL(source.src, "http://localhost");
    return url.searchParams.get("filename");
  } catch {
    return null;
  }
}

function drawnFilenames(): string[] {
  return drawImage.mock.calls
    .map((call) => filenameFromSource(call[0]))
    .filter((value): value is string => Boolean(value));
}

describe("PreviewSurface", () => {
  it("uses a single canvas compositing surface without DOM image layers", () => {
    renderSurface({ layers: [BG_LAYER, FG_LAYER, PIP_LAYER] });

    expect(screen.getByTestId("preview-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-background")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-foreground")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-pip")).not.toBeInTheDocument();
  });

  it("tracks render-state matrix on canvas metadata", () => {
    const { rerender, props } = renderSurface({
      currentTime: 5,
      layers: [BG_LAYER],
      subtitles: SUBTITLES_ON,
      watermark: WATERMARK_ON,
    });

    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-has-background", "true");
    expect(canvas).toHaveAttribute("data-has-foreground", "false");
    expect(canvas).toHaveAttribute("data-has-pip", "false");
    expect(canvas).toHaveAttribute("data-subtitle-visible", "true");
    expect(canvas).toHaveAttribute("data-watermark-visible", "true");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          {...props}
          layers={[FG_LAYER, PIP_LAYER]}
          subtitles={null}
          watermark={null}
        />
      </NextIntlClientProvider>,
    );

    expect(canvas).toHaveAttribute("data-has-background", "false");
    expect(canvas).toHaveAttribute("data-has-foreground", "true");
    expect(canvas).toHaveAttribute("data-has-pip", "true");
    expect(canvas).toHaveAttribute("data-subtitle-visible", "false");
    expect(canvas).toHaveAttribute("data-watermark-visible", "false");
  });

  it("draws layers in render order on canvas (fg hides bg, pip above fg, watermark above all)", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_VIDEO_LAYER, FG_VIDEO_LAYER, BG_VIDEO_LAYER],
      subtitles: SUBTITLES_ON,
      watermark: WATERMARK_VIDEO_ON,
    });

    const filenames = drawnFilenames();
    const fgIndex = filenames.indexOf("fg0.mov");
    const pipIndex = filenames.indexOf("pip0.webm");
    const canvas = screen.getByTestId("preview-canvas");

    expect(filenames).not.toContain("bg0.mp4");
    expect(fgIndex).toBeGreaterThanOrEqual(0);
    expect(pipIndex).toBeGreaterThan(fgIndex);
    expect(canvas).toHaveAttribute("data-watermark-visible", "true");
    expect(fillText).toHaveBeenCalled();
  });

  it("hides background while fullscreen foreground is active and keeps pip present", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, FG_LAYER, BG_LAYER],
      subtitles: SUBTITLES_ON,
    });

    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-has-background", "false");
    expect(canvas).toHaveAttribute("data-has-foreground", "true");
    expect(canvas).toHaveAttribute("data-has-pip", "true");
  });

  it("renders one or more active pip overlays in state metadata", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, PIP_VIDEO_LAYER, BG_LAYER],
    });

    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-pip-count", "2");
  });

  it("creates hidden video decoders for video layers and skips non-video layers", () => {
    renderSurface({
      currentTime: 5,
      layers: [FG_VIDEO_LAYER, BG_VIDEO_LAYER, PIP_VIDEO_LAYER, BG_LAYER],
    });

    const decoders = screen.getAllByTestId("preview-video-decoder");
    expect(decoders).toHaveLength(3);
    expect(decoders.every((node) => node.tagName === "VIDEO")).toBe(true);
    expect(decoders.every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(decoders.every((node) => node.getAttribute("preload") === "metadata")).toBe(true);
  });

  it("redraws continuously on requestAnimationFrame while playing and redraws on pause/seek edits", async () => {
    const { rerender, props } = renderSurface({ currentTime: 1, layers: [BG_LAYER], playing: true });
    expect(requestAnimationFrame).toHaveBeenCalled();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} playing={false} currentTime={2} layers={[BG_LAYER, FG_LAYER]} />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(fillRect).toHaveBeenCalled();
    });
  });

  it("resolves active visual state from playback clock each rAF frame while currentTime prop is stale", () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    }));

    const playbackClock = { current: { currentTime: 0 } as HTMLAudioElement };
    renderSurface({
      currentTime: 0,
      layers: [BG_LAYER, FG_LAYER_LATE],
      playbackClock,
      playing: true,
      subtitles: SUBTITLES_ON,
    });

    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-draw-order", "black>bg>subtitle");
    expect(canvas).toHaveAttribute("data-has-foreground", "false");

    playbackClock.current.currentTime = 6;
    frameCallback?.(16);

    expect(canvas).toHaveAttribute("data-draw-order", "black>fg>subtitle");
    expect(canvas).toHaveAttribute("data-has-foreground", "true");
    expect(canvas).toHaveAttribute("data-has-background", "false");
  });

  it("renders subtitles only when burn-in is enabled", () => {
    const { rerender, props } = renderSurface({ layers: [BG_LAYER], subtitles: null, currentTime: 1 });
    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-subtitle-visible", "false");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          {...props}
          subtitles={{ burn_in: false, style: SUBTITLES_ON.style }}
        />
      </NextIntlClientProvider>,
    );
    expect(canvas).toHaveAttribute("data-subtitle-visible", "false");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} subtitles={SUBTITLES_ON} />
      </NextIntlClientProvider>,
    );
    expect(canvas).toHaveAttribute("data-subtitle-visible", "true");
    expect(canvas).toHaveAttribute("data-subtitle-position", "top");
    expect(screen.getByTestId("preview-subtitle-live")).toHaveTextContent("Capitalism begins here.");
  });

  it("toggles watermark visibility from config", () => {
    const { rerender, props } = renderSurface({ layers: [BG_LAYER], watermark: null });
    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-watermark-visible", "false");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} watermark={WATERMARK_ON} />
      </NextIntlClientProvider>,
    );
    expect(canvas).toHaveAttribute("data-watermark-visible", "true");
  });

  it("renders transport controls and playing/paused states", () => {
    const { props, rerender } = renderSurface({ currentTime: 12.5, duration: 30, playing: false });

    fireEvent.click(screen.getByRole("button", { name: "Previous sentence" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Next sentence" }));
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText("00:12.500")).toBeInTheDocument();
    expect(screen.getByText("00:30.000")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} playing />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("switches framing class for 9:16 and keeps 1080p/720p in 16:9", () => {
    const { rerender, props } = renderSurface({ resolution: "9:16" });
    const frame = screen.getByTestId("preview-canvas-frame");
    expect(frame.className).toContain("h-full");
    expect(frame).toHaveStyle({ aspectRatio: "9 / 16" });

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} resolution="720p" />
      </NextIntlClientProvider>,
    );
    expect(frame.className).toContain("w-full");
    expect(frame).toHaveStyle({ aspectRatio: "16 / 9" });
  });

  it("draws video frames through canvas drawImage when active video decoders are present", () => {
    renderSurface({
      currentTime: 5,
      layers: [FG_VIDEO_LAYER, PIP_VIDEO_LAYER, BG_VIDEO_LAYER],
    });

    expect(drawImage).toHaveBeenCalled();
    expect(drawnFilenames()).toContain("fg0.mov");
  });
});
