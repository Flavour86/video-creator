import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// Mock wavesurfer.js before component import
vi.mock("wavesurfer.js", () => ({
  default: {
    create: vi.fn().mockReturnValue({
      on: vi.fn(),
      load: vi.fn(),
      destroy: vi.fn(),
      setTime: vi.fn(),
      playPause: vi.fn(),
      getCurrentTime: vi.fn().mockReturnValue(0),
      getDuration: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false),
    }),
  },
}));

import { Waveform } from "./Waveform";

it("renders the waveform container element", () => {
  const { container } = render(
    <Waveform
      audioUrl=""
      sentences={[]}
      onDurationReady={vi.fn()}
      onTimeUpdate={vi.fn()}
    />,
  );
  expect(container.firstChild).toBeInTheDocument();
});

it("renders a play/pause button", () => {
  render(
    <Waveform
      audioUrl=""
      sentences={[]}
      onDurationReady={vi.fn()}
      onTimeUpdate={vi.fn()}
    />,
  );
  // Play button always present (shows ▶ or ⏸)
  const btn = screen.getByRole("button");
  expect(btn).toBeInTheDocument();
});

it("shows 0:00 / 0:00 time display before audio loads", () => {
  render(
    <Waveform
      audioUrl=""
      sentences={[]}
      onDurationReady={vi.fn()}
      onTimeUpdate={vi.fn()}
    />,
  );
  expect(screen.getByText(/0:00/)).toBeInTheDocument();
});
