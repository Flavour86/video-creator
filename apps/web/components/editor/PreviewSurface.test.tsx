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
const WATERMARK_VIDEO_OFF = {
  ...WATERMARK_VIDEO_ON,
  enabled: false,
} as Project["watermark"];

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
    media: [],
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

  it("draws layers in render order on canvas (bg remains under fg, pip, subtitles, and watermark)", () => {
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

    const bgIndex = filenames.indexOf("bg0.mp4");
    expect(bgIndex).toBeGreaterThanOrEqual(0);
    expect(fgIndex).toBeGreaterThan(bgIndex);
    expect(pipIndex).toBeGreaterThan(fgIndex);
    expect(canvas).toHaveAttribute("data-watermark-visible", "true");
    expect(fillText).toHaveBeenCalled();
  });

  it("draws both background images during a playlist crossfade", () => {
    const imageFactory = vi.fn(function imageFactory() {
      const image = document.createElement("img");
      Object.defineProperty(image, "complete", { configurable: true, value: true });
      Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1920 });
      Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1080 });
      return image;
    });
    vi.stubGlobal("Image", imageFactory);
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...BG_LAYER.items[0]!,
        mediaId: undefined,
        mediaIds: ["bg-a.png", "bg-b.png"],
        start: 0,
        end: 10,
        crossfade: 1,
      }],
    };

    renderSurface({ currentTime: 4.5, layers: [layer] });

    expect(drawnFilenames().slice(0, 2)).toEqual(["bg-a.png", "bg-b.png"]);
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-has-background", "true");
  });

  it("draws scheduled background media by current time and records the active id", () => {
    vi.stubGlobal("Image", vi.fn(function imageFactory() {
      const image = document.createElement("img");
      Object.defineProperty(image, "complete", { configurable: true, value: true });
      Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1920 });
      Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1080 });
      return image;
    }));
    const layer: Layer = {
      ...BG_LAYER,
      items: [{
        ...BG_LAYER.items[0]!,
        mediaId: undefined,
        mediaIds: ["bg-a.png", "bg-b.png", "bg-c.png"],
        schedule: [
          { id: "seg-a", mediaId: "bg-a.png", start: 0, end: 3, lockedDuration: false },
          { id: "seg-b", mediaId: "bg-b.png", start: 3, end: 8, lockedDuration: false },
          { id: "seg-c", mediaId: "bg-c.png", start: 8, end: 20, lockedDuration: false },
        ],
        start: 0,
        end: 20,
        crossfade: 0,
      }],
    };

    const { rerender, props } = renderSurface({ currentTime: 4, layers: [layer] });
    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-active-backgrounds", "bg-b.png");
    expect(drawnFilenames().at(-1)).toBe("bg-b.png");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} currentTime={12} layers={[layer]} />
      </NextIntlClientProvider>,
    );

    expect(canvas).toHaveAttribute("data-active-backgrounds", "bg-c.png");
    expect(drawnFilenames().at(-1)).toBe("bg-c.png");
  });

  it("uses uploaded media URLs for newly imported background assets", () => {
    const createdImages: HTMLImageElement[] = [];
    const imageFactory = vi.fn(function imageFactory() {
      const image = document.createElement("img");
      createdImages.push(image);
      return image;
    });
    vi.stubGlobal("Image", imageFactory);

    renderSurface({
      layers: [{
        ...BG_LAYER,
        items: [{ ...BG_LAYER.items[0]!, mediaId: "uploaded-bg.png" }],
      }],
      media: [{
        filename: "uploaded-bg.png",
        import_mode: "copy",
        imported_at: "2026-05-28T00:00:00.000Z",
        kind: "image",
        mediaId: "uploaded-bg.png",
        path: "uploads/uploaded-bg.png",
        size: 100,
        thumb_url: "",
      }],
    });

    expect(createdImages[0].src).toContain("/api/server/uploads/media-file");
    expect(createdImages[0].src).toContain("filename=uploaded-bg.png");
  });

  it("keeps background beneath fullscreen foreground and keeps pip present", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, FG_LAYER, BG_LAYER],
      subtitles: SUBTITLES_ON,
    });

    const canvas = screen.getByTestId("preview-canvas");
    expect(canvas).toHaveAttribute("data-has-background", "true");
    expect(canvas).toHaveAttribute("data-has-foreground", "true");
    expect(canvas).toHaveAttribute("data-has-pip", "true");
  });

  it("crops background media to cover the complete preview frame", () => {
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(600);

    renderSurface({
      currentTime: 5,
      layers: [BG_VIDEO_LAYER],
      resolution: "1080p",
    });

    const backgroundDraw = drawImage.mock.calls.find((call) => filenameFromSource(call[0]) === "bg0.mp4");
    expect(backgroundDraw).toBeDefined();
    expect(backgroundDraw).toHaveLength(9);
    const [, , , cropWidth, cropHeight, x, y, width, height] = backgroundDraw as [
      unknown,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    expect([x, y, width, height]).toEqual([0, 0, 1920, 1080]);
    expect(cropWidth / cropHeight).toBeCloseTo(16 / 9);
  });

  it("renders one or more active pip overlays in state metadata", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, PIP_VIDEO_LAYER, BG_LAYER],
    });

    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-pip-count", "2");
  });

  it.each([
    ["1080p", 1920, 1080],
    ["720p", 1280, 720],
    ["9:16", 1080, 1920],
  ])("draws PiP placement anchors inside the correct preview quadrant for %s", (resolution, canvasWidth, canvasHeight) => {
    const placements = [
      { label: "TL", posX: 4, posY: 4, quadrantX: 0, quadrantY: 0 },
      { label: "TC", posX: 50, posY: 4, quadrantX: 1, quadrantY: 0 },
      { label: "TR", posX: 96, posY: 4, quadrantX: 2, quadrantY: 0 },
      { label: "ML", posX: 4, posY: 50, quadrantX: 0, quadrantY: 1 },
      { label: "MC", posX: 50, posY: 50, quadrantX: 1, quadrantY: 1 },
      { label: "MR", posX: 96, posY: 50, quadrantX: 2, quadrantY: 1 },
      { label: "BL", posX: 4, posY: 96, quadrantX: 0, quadrantY: 2 },
      { label: "BC", posX: 50, posY: 96, quadrantX: 1, quadrantY: 2 },
      { label: "BR", posX: 96, posY: 96, quadrantX: 2, quadrantY: 2 },
    ];

    for (const placement of placements) {
      drawImage.mockClear();
      const pipLayer: Layer = {
        ...PIP_VIDEO_LAYER,
        items: [{
          ...PIP_VIDEO_LAYER.items[0]!,
          pip: {
            ...PIP_VIDEO_LAYER.items[0]!.pip,
            posX: placement.posX,
            posY: placement.posY,
            size: 30,
          },
        }],
      };

      const { unmount } = renderSurface({
        currentTime: 5,
        layers: [pipLayer],
        resolution,
      });
      const pipDraw = drawImage.mock.calls.find((call) => filenameFromSource(call[0]) === "pip0.webm");
      unmount();

      expect(pipDraw, placement.label).toBeDefined();
      const [, x, y, width, height] = pipDraw as [unknown, number, number, number, number];
      expect(x, placement.label).toBeGreaterThanOrEqual(0);
      expect(y, placement.label).toBeGreaterThanOrEqual(0);
      expect(x + width, placement.label).toBeLessThanOrEqual(canvasWidth);
      expect(y + height, placement.label).toBeLessThanOrEqual(canvasHeight);

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      expect(Math.floor((centerX / canvasWidth) * 3), placement.label).toBe(placement.quadrantX);
      expect(Math.floor((centerY / canvasHeight) * 3), placement.label).toBe(placement.quadrantY);
    }
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

  it("uses video metadata and upload paths for stable background video ids", async () => {
    const layer: Layer = {
      ...BG_VIDEO_LAYER,
      items: [{
        ...BG_VIDEO_LAYER.items[0]!,
        mediaId: "upload-video-bg-1",
        start: 2,
        end: 8,
      }],
    };

    renderSurface({
      currentTime: 5,
      layers: [layer],
      media: [{
        filename: "uploaded-bg.mp4",
        import_mode: "copy",
        imported_at: "2026-06-01T00:00:00.000Z",
        kind: "video",
        mediaId: "upload-video-bg-1",
        path: "uploads/uploaded-bg.mp4",
        size: 100,
        thumb_url: "/uploads/thumb?filename=uploaded-bg.jpg",
      }],
    });

    const decoder = await screen.findByTestId("preview-video-decoder") as HTMLVideoElement;
    expect(decoder.src).toContain("/api/server/uploads/media-file");
    expect(decoder.src).toContain("filename=uploaded-bg.mp4");
    await waitFor(() => expect(decoder.currentTime).toBe(3));
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
    expect(frameCallback).not.toBeNull();
    (frameCallback as FrameRequestCallback)(16);

    expect(canvas).toHaveAttribute("data-draw-order", "black>bg>fg>subtitle");
    expect(canvas).toHaveAttribute("data-has-foreground", "true");
    expect(canvas).toHaveAttribute("data-has-background", "true");
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

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} watermark={WATERMARK_VIDEO_OFF} />
      </NextIntlClientProvider>,
    );
    expect(canvas).toHaveAttribute("data-watermark-visible", "false");
  });

  it("draws the selected watermark media instead of a placeholder decoration", () => {
    renderSurface({ layers: [BG_LAYER], watermark: WATERMARK_VIDEO_ON });

    expect(drawnFilenames()).toContain("logo.mov");
  });

  it("draws watermark with configured position, opacity, and scale", () => {
    renderSurface({
      watermark: {
        mediaId: "logo.mov",
        opacity: 42,
        posX: 30,
        posY: 70,
        scale: 0.16,
      },
    });

    const watermarkCall = drawImage.mock.calls.find((call) => filenameFromSource(call[0]) === "logo.mov");

    expect(watermarkCall).toBeDefined();
    expect(watermarkCall?.[1]).toBeCloseTo(483.84, 2);
    expect(watermarkCall?.[2]).toBeCloseTo(635.04, 2);
    expect(watermarkCall?.[3]).toBeCloseTo(307.2, 2);
    expect(watermarkCall?.[4]).toBeCloseTo(172.8, 2);
    expect((fakeContext as CanvasRenderingContext2D & { globalAlpha: number }).globalAlpha).toBeCloseTo(0.42, 2);
  });

  it("falls back to uploaded image media when a watermark is not in project media", () => {
    const createdImages: HTMLImageElement[] = [];
    const imageFactory = vi.fn(function imageFactory() {
      const image = document.createElement("img");
      createdImages.push(image);
      return image;
    });
    vi.stubGlobal("Image", imageFactory);

    renderSurface({ watermark: WATERMARK_ON });

    expect(createdImages).toHaveLength(1);
    expect(createdImages[0].src).toContain("/api/server/projects/media-file");
    const errorHandler = createdImages[0].onerror;
    expect(typeof errorHandler).toBe("function");
    if (typeof errorHandler === "function") {
      errorHandler.call(createdImages[0], new Event("error"));
    }
    expect(createdImages[0].src).toContain("/api/server/uploads/media-file");
    expect(createdImages[0].src).toContain("filename=logo.png");
  });

  it("uses the uploaded watermark URL directly when media metadata identifies it", () => {
    const createdImages: HTMLImageElement[] = [];
    const imageFactory = vi.fn(function imageFactory() {
      const image = document.createElement("img");
      createdImages.push(image);
      return image;
    });
    vi.stubGlobal("Image", imageFactory);

    renderSurface({
      media: [{
        filename: "logo.png",
        import_mode: "copy",
        imported_at: "2026-05-28T00:00:00.000Z",
        kind: "watermark_image",
        mediaId: "logo.png",
        path: "uploads/logo.png",
        size: 100,
        thumb_url: "",
      }],
      watermark: WATERMARK_ON,
    });

    expect(createdImages[0].src).toContain("/api/server/uploads/media-file");
    expect(createdImages[0].src).not.toContain("/api/server/projects/media-file");
  });

  it("falls back to uploaded video media for watermark decoders", () => {
    renderSurface({ watermark: WATERMARK_VIDEO_ON });

    const decoder = screen.getByTestId("preview-video-decoder") as HTMLVideoElement;
    const load = vi.fn();
    decoder.load = load;
    expect(decoder.src).toContain("/api/server/projects/media-file");

    fireEvent.error(decoder);

    expect(decoder.src).toContain("/api/server/uploads/media-file");
    expect(decoder.src).toContain("filename=logo.mov");
    expect(load).toHaveBeenCalled();
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

  it.each([
    ["1080p", 1920, 1080],
    ["720p", 1280, 720],
    ["9:16", 1080, 1920],
  ] as const)("composites preview content on the %s render canvas", (resolution, width, height) => {
    renderSurface({ resolution, layers: [BG_LAYER, PIP_LAYER], subtitles: SUBTITLES_ON, watermark: WATERMARK_VIDEO_ON });
    const canvas = screen.getByTestId("preview-canvas") as HTMLCanvasElement;

    expect(canvas.width).toBe(width);
    expect(canvas.height).toBe(height);
    expect(canvas).toHaveAttribute("data-has-pip", "true");
    expect(canvas).toHaveAttribute("data-subtitle-visible", "true");
    expect(canvas).toHaveAttribute("data-watermark-visible", "true");
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
