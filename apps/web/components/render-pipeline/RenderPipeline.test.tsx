import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { RenderPipeline } from "./RenderPipeline";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

it("renders stage rows and running progress", () => {
  const onCancel = vi.fn();
  render(
    <RenderPipeline
      onCancel={onCancel}
      projectPath="E:/project"
      state={{
        status: "running",
        renderId: "r-1",
        outputPath: "E:/project/renders/r-1.mp4",
        stage: "compose",
        percent: 42,
        etaSeconds: 12,
        message: "ffmpeg compose",
      }}
    />,
  );

  expect(screen.getByText("Verifying Cache")).toBeInTheDocument();
  expect(screen.getByText("Pre-rendering Clips")).toBeInTheDocument();
  expect(screen.getByText("Building Subtitles")).toBeInTheDocument();
  expect(screen.getByText("FFmpeg Compose")).toBeInTheDocument();
  expect(screen.getByText("Muxing Audio")).toBeInTheDocument();
  expect(screen.getByText("42%")).toBeInTheDocument();
  expect(screen.getByText("12s remaining")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("plays and opens a completed render", async () => {
  render(
    <RenderPipeline
      onCancel={vi.fn()}
      projectPath="E:/project"
      state={{
        status: "done",
        renderId: "r-1",
        outputPath: "E:/project/renders/r-1.mp4",
        percent: 100,
        message: "Render ready",
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /play/i }));
  fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/renders/r-1/play?project=E%3A%2Fproject",
      { method: "POST" },
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/renders/r-1/reveal?project=E%3A%2Fproject",
      { method: "POST" },
    );
  });
});
