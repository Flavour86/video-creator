import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";
import type { RenderJob } from "@/lib/render/types";
import { OutputPanel } from "./OutputPanel";

describe("OutputPanel", () => {
  it("shows the spec output fields with actual disk size", () => {
    renderPanel(job());

    expect(screen.getByText("Tokyo Essay")).toBeInTheDocument();
    expect(screen.getByText("1080p (1920x1080)")).toBeInTheDocument();
    expect(screen.getByText("30 fps")).toBeInTheDocument();
    expect(screen.getByText("H.264")).toBeInTheDocument();
    expect(screen.getByText("CRF 18")).toBeInTheDocument();
    expect(screen.getByText("x264 slow")).toBeInTheDocument();
    expect(screen.getByText("aac")).toBeInTheDocument();
    expect(screen.getByText("192kbps")).toBeInTheDocument();
    expect(screen.getByText("48 kHz")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("surfaces missing and partial output states", () => {
    const { rerender } = renderPanel(job({ bytes: null, outputExists: false }));
    expect(screen.getByText("missing output")).toBeInTheDocument();

    rerender(withIntl(<OutputPanel job={job({ bytes: null, outputExists: false, phase: "partialExcluded", status: "partial_excluded" })} projectName="Tokyo Essay" />));
    expect(screen.getByText("partial output excluded")).toBeInTheDocument();
  });
});

function renderPanel(renderJob: RenderJob) {
  return render(withIntl(<OutputPanel job={renderJob} projectName="Tokyo Essay" />));
}

function withIntl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      {children}
    </NextIntlClientProvider>
  );
}

function job(overrides: Partial<RenderJob> = {}): RenderJob {
  return {
    artifacts: [],
    bytes: 2048,
    capabilities: { reveal_in_explorer_supported: true },
    durationSec: 3,
    etaSec: null,
    events: [],
    filename: "final-1.mp4",
    finishedAt: "2026-05-09T00:00:03Z",
    framesWritten: 90,
    id: "r-1",
    manifest: {
      audioBitrate: 192000,
      audioCodec: "aac",
      colorMatrix: "bt.709",
      codec: "H.264",
      crf: 18,
      estimatedBytes: 100 * 1024 * 1024,
      fps: 30,
      height: 1080,
      pixfmt: "yuv420p",
      preset: "x264 slow",
      width: 1920,
    },
    outputExists: true,
    outputPath: "E:/project/renders/final-1.mp4",
    phase: "done",
    preset: "final",
    progress: 100,
    resolution: "1920x1080",
    speed: null,
    startedAt: "2026-05-09T00:00:00Z",
    status: "done",
    ...overrides,
  };
}
