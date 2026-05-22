import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { RenderJob, RenderPhase } from "@/lib/render/types";
import { RenderCard } from "./RenderCard";

describe("RenderCard", () => {
  it("shows live progress filename, specs, status, stats, and stage state", () => {
    renderCard(job({ phase: "composing", progress: 42.5, speed: "1.2x", etaSec: 65, framesWritten: 1234 }));

    expect(screen.getByText("final.mp4")).toBeInTheDocument();
    expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
    expect(screen.getByText("Composing 1080p MP4")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Render progress" })).toHaveAttribute("aria-valuenow", "42.5");
    expect(screen.getByText("42.5%")).toBeInTheDocument();
    expect(screen.getByText("1.2x")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Compose filtergraph")).toBeInTheDocument();
  });

  it.each([
    [null, "No render in progress"],
    ["queued", "Render queued"],
    ["verifying", "Verifying alignment cache"],
    ["prerender", "Pre-rendering clips"],
    ["subtitles", "Building subtitles"],
    ["composing", "Composing 1080p MP4"],
    ["muxing", "Muxing 1080p MP4"],
    ["loggingHistory", "Logging render history"],
    ["done", "Final render ready"],
    ["cancelling", "Cancelling render"],
    ["cancelled", "Render cancelled"],
    ["failed", "Render failed"],
    ["outputMissing", "Render output missing"],
    ["partialExcluded", "Partial output excluded"],
    ["ffmpegWarning", "ffmpeg warning"],
    ["ffmpegFatalError", "ffmpeg fatal error"],
    ["historyEmpty", "No render history"],
  ] as const)("renders the %s state label", (phase, label) => {
    renderCard(phase ? job({ phase }) : null);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

function renderCard(renderJob: RenderJob | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RenderCard job={renderJob} />
    </NextIntlClientProvider>,
  );
}

function job(overrides: Partial<RenderJob> & { phase: RenderPhase }): RenderJob {
  return {
    artifacts: [],
    bytes: 0,
    capabilities: { reveal_in_explorer_supported: false },
    durationSec: null,
    etaSec: null,
    events: [],
    filename: "final.mp4",
    finishedAt: null,
    framesWritten: 0,
    id: "r-card",
    manifest: {
      audioBitrate: 192000,
      audioCodec: "aac",
      colorMatrix: "bt.709",
      codec: "H.264",
      crf: 18,
      estimatedBytes: 100,
      fps: 30,
      height: 1080,
      pixfmt: "yuv420p",
      preset: "x264 slow",
      width: 1920,
    },
    outputExists: true,
    outputPath: "E:/project/renders/final.mp4",
    phase: overrides.phase,
    preset: "final",
    progress: 0,
    resolution: "1920x1080",
    speed: null,
    startedAt: "2026-05-21T10:00:00Z",
    status: "running",
    ...overrides,
  };
}
