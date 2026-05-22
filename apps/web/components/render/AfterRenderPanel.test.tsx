import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";
import type { RenderJob } from "@/lib/render/types";
import { AfterRenderPanel } from "./AfterRenderPanel";

it("always renders Play locally and removes non-spec upload actions", () => {
  const onPlay = vi.fn();
  renderPanel({ onPlay, revealEnabled: false });

  fireEvent.click(screen.getByRole("button", { name: /play locally/i }));
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /reveal in explorer/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
});

it("renders Reveal in Explorer only when capability data allows it", () => {
  renderPanel({ revealEnabled: true });
  expect(screen.getByRole("button", { name: /reveal in explorer/i })).toBeInTheDocument();
});

it("disables after-render actions when output is not playable", () => {
  renderPanel({ job: job({ outputExists: false, phase: "outputMissing", status: "output_missing" }), revealEnabled: true });

  expect(screen.getByRole("button", { name: /play locally/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /reveal in explorer/i })).toBeDisabled();
});

function renderPanel({
  job: renderJob = job(),
  onPlay = vi.fn(),
  onReveal = vi.fn(),
  revealEnabled,
}: {
  job?: RenderJob | null;
  onPlay?: () => void;
  onReveal?: () => void;
  revealEnabled: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      <AfterRenderPanel job={renderJob} onPlay={onPlay} onReveal={onReveal} revealEnabled={revealEnabled} />
    </NextIntlClientProvider>,
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
