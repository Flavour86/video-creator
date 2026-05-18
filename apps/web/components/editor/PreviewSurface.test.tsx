import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import type { ComponentProps, ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
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
const PIP_LAYER_2: Layer = {
  id: "pip-main-2",
  kind: "pip",
  name: "PiP 2",
  items: [{
    id: "pip-2",
    mediaId: "pip1.png",
    sentences: [1, 1],
    start: 0,
    end: 20,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
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
const SUBTITLE_STYLE = SUBTITLES_ON.style;

const WATERMARK_ON: Project["watermark"] = {
  mediaId: "logo.png",
  opacity: 90,
  posX: 90,
  posY: 10,
  scale: 0.08,
};

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

describe("PreviewSurface", () => {
  it("renders pure black fallback without textual empty-state copy", () => {
    renderSurface({ layers: [], sentences: [] });

    expect(screen.getByTestId("preview-black-fallback")).toBeInTheDocument();
    expect(screen.queryByText(/no media assigned/i)).not.toBeInTheDocument();
  });

  it("renders layers in documented order when background is active", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, BG_LAYER],
      subtitles: SUBTITLES_ON,
      watermark: WATERMARK_ON,
    });

    const black = screen.getByTestId("preview-black-fallback");
    const background = screen.getByTestId("preview-background");
    const pip = screen.getByTestId("preview-pip");
    const subtitle = screen.getByTestId("preview-subtitle");
    const watermark = screen.getByTestId("preview-watermark");

    expect(black.compareDocumentPosition(background) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(background.compareDocumentPosition(pip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pip.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subtitle.compareDocumentPosition(watermark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides background while fullscreen foreground is active and keeps PiP above foreground", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, FG_LAYER, BG_LAYER],
      subtitles: SUBTITLES_ON,
    });

    expect(screen.queryByTestId("preview-background")).not.toBeInTheDocument();
    const fg = screen.getByTestId("preview-foreground");
    const pip = screen.getByTestId("preview-pip");
    expect(fg.compareDocumentPosition(pip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders one or more active PiP overlays", () => {
    renderSurface({
      currentTime: 5,
      layers: [PIP_LAYER, PIP_LAYER_2, BG_LAYER],
    });

    expect(screen.getAllByTestId("preview-pip")).toHaveLength(2);
  });

  it("shows subtitles only when burn-in is enabled and applies style fields", () => {
    const { rerender } = renderSurface({ currentTime: 1, layers: [BG_LAYER], subtitles: null });
    expect(screen.queryByTestId("preview-subtitle")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          currentTime={1}
          duration={20}
          layers={[BG_LAYER]}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onTogglePlay={vi.fn()}
          playing={false}
          projectPath="E:/projects/test01"
          resolution="1080p"
          sentences={SENTENCES}
          subtitles={{ burn_in: false, style: SUBTITLE_STYLE }}
          watermark={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("preview-subtitle")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          currentTime={1}
          duration={20}
          layers={[BG_LAYER]}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onTogglePlay={vi.fn()}
          playing={false}
          projectPath="E:/projects/test01"
          resolution="1080p"
          sentences={SENTENCES}
          subtitles={SUBTITLES_ON}
          watermark={null}
        />
      </NextIntlClientProvider>,
    );
    const subtitle = screen.getByTestId("preview-subtitle");
    expect(subtitle).toHaveTextContent("Capitalism begins here.");
    expect(subtitle).toHaveStyle({ fontFamily: "Helvetica Neue", fontSize: "36px" });
    expect(subtitle).toHaveAttribute("data-subtitle-position", "top");
    expect(subtitle).toHaveAttribute("data-subtitle-bg-style", "pill");
    expect(subtitle).toHaveAttribute("data-subtitle-max-chars", "30");
  });

  it("wraps subtitle text using max_chars_per_line and keeps each line under limit", () => {
    renderSurface({
      currentTime: 1,
      layers: [BG_LAYER],
      sentences: [{ index: 1, text: "one two three four five six", start_s: 0, end_s: 10, confidence_avg: 0.9 }],
      subtitles: {
        burn_in: true,
        style: {
          bg_style: "block",
          font: "Arial",
          max_chars_per_line: 8,
          position: "bottom_low",
          size: 32,
        },
      },
    });

    const subtitle = screen.getByTestId("preview-subtitle");
    const lines = subtitle.textContent?.split("\n") ?? [];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 8)).toBe(true);
    expect(subtitle).toHaveAttribute("data-subtitle-position", "bottom_low");
    expect(subtitle).toHaveAttribute("data-subtitle-bg-style", "block");
    expect(subtitle.className).toContain("bottom-[3%]");
    expect(subtitle.className).toContain("rounded-md bg-black/80 px-4 py-2");
  });

  it("toggles watermark visibility from config", () => {
    const { rerender } = renderSurface({ layers: [BG_LAYER], watermark: null });
    expect(screen.queryByTestId("preview-watermark")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          currentTime={0}
          duration={20}
          layers={[BG_LAYER]}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onTogglePlay={vi.fn()}
          playing={false}
          projectPath="E:/projects/test01"
          resolution="1080p"
          sentences={SENTENCES}
          subtitles={null}
          watermark={WATERMARK_ON}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("preview-watermark")).toBeInTheDocument();
  });

  it("renders transport controls and live timecode", () => {
    const { props, rerender } = renderSurface({ currentTime: 12.5, duration: 30 });

    fireEvent.click(screen.getByRole("button", { name: "Previous sentence" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Next sentence" }));

    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText("00:00:12.500")).toBeInTheDocument();
    expect(screen.getByText("00:00:30.000")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface {...props} playing />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("switches framing class for 9:16 and keeps 1080p/720p in 16:9", () => {
    const { rerender } = renderSurface({ resolution: "9:16" });
    expect(screen.getByTestId("preview-stage").className).toContain("aspect-[9/16]");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewSurface
          currentTime={0}
          duration={20}
          layers={[]}
          onNext={vi.fn()}
          onPrevious={vi.fn()}
          onTogglePlay={vi.fn()}
          playing={false}
          projectPath="E:/projects/test01"
          resolution="720p"
          sentences={[]}
          subtitles={null}
          watermark={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("preview-stage").className).toContain("aspect-video");
  });
});
