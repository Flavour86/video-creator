import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { RenderJob } from "@/lib/render/types";
import { LogCard } from "./LogCard";

const mocks = vi.hoisted(() => ({
  follow: vi.fn(),
  lines: [] as Array<{ glyph?: "info" | "ok" | "warn" | "err"; line: string; timestamp: string }>,
  paused: false,
}));

vi.mock("@/lib/render/useFfmpegLog", () => ({
  useFfmpegLog: () => ({
    follow: mocks.follow,
    lines: mocks.lines,
    pause: vi.fn(),
    paused: mocks.paused,
  }),
}));

vi.mock("@/lib/render/useStickyScroll", () => ({
  useStickyScroll: () => ({
    follow: vi.fn(),
    onScroll: vi.fn(),
    paused: false,
    scrollIfSticky: vi.fn(),
  }),
}));

describe("LogCard", () => {
  beforeEach(() => {
    mocks.follow.mockReset();
    mocks.lines = [];
    mocks.paused = false;
  });

  it("shows live ffmpeg log lines", () => {
    mocks.lines = [{ glyph: "info", line: "frame=42 speed=1.2x", timestamp: "00:00:01" }];

    renderLog(job());

    expect(screen.getByText("frame=42 speed=1.2x")).toBeInTheDocument();
    expect(screen.getByText("tail / live")).toBeInTheDocument();
  });

  it("reopens persisted render event log lines when live socket lines are absent", () => {
    renderLog(job({
      events: [
        {
          event_id: "e-warning",
          kind: "progress",
          message: "warning: clipped samples",
          render_id: "r-log",
          stage: "compose_filtergraph",
        },
      ],
      phase: "done",
    }));

    expect(screen.getByText("warning: clipped samples")).toBeInTheDocument();
    expect(screen.getByText("tail / finished")).toBeInTheDocument();
  });

  it("shows the persisted log artifact path when no persisted event messages exist", () => {
    renderLog(job({
      artifacts: [{ artifact_id: "a-log", kind: "log", path: "E:/project/.vc/logs/r-log.log" }],
      events: [],
      phase: "done",
    }));

    expect(screen.getByText("persisted log: E:/project/.vc/logs/r-log.log")).toBeInTheDocument();
  });
});

function renderLog(renderJob: RenderJob) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LogCard job={renderJob} />
    </NextIntlClientProvider>,
  );
}

function job(overrides: Partial<RenderJob> = {}): RenderJob {
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
    id: "r-log",
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
    phase: "composing",
    preset: "final",
    progress: 42,
    resolution: "1920x1080",
    speed: "1.2x",
    startedAt: "2026-05-21T10:00:00Z",
    status: "running",
    ...overrides,
  };
}
