import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { RenderPipeline } from "./RenderPipeline";

const openMock = vi.fn();

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  openMock.mockReset();
  vi.stubGlobal("open", openMock);
});

it("renders stage rows and running progress", () => {
  const onCancel = vi.fn();
  render(
    <RenderPipeline
      onCancel={onCancel}
      projectId="p-1"
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

it("opens play URL and calls reveal endpoint for completed render", async () => {
  render(
    <RenderPipeline
      onCancel={vi.fn()}
      projectId="p-1"
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
    expect(openMock).toHaveBeenCalledWith(
      "/api/server/projects/p-1/render/r-1",
      "_blank",
      "noopener,noreferrer",
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/system/reveal",
      {
        body: JSON.stringify({ path: "E:/project/renders/r-1.mp4" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
  });
});

it("maps canonical compose stage to active compose step", () => {
  render(
    <RenderPipeline
      onCancel={vi.fn()}
      projectId="p-1"
      projectPath="E:/project"
      state={{
        status: "running",
        renderId: "r-1",
        outputPath: "E:/project/renders/r-1.mp4",
        stage: "compose_filtergraph",
        percent: 55,
        message: "compose",
      }}
    />,
  );

  const composeRow = screen.getByText("FFmpeg Compose").closest("div.rounded.border");
  const subtitlesRow = screen.getByText("Building Subtitles").closest("div.rounded.border");
  expect(composeRow).not.toBeNull();
  expect(subtitlesRow).not.toBeNull();
  expect(within(composeRow as HTMLElement).getByText("active")).toBeInTheDocument();
  expect(within(subtitlesRow as HTMLElement).getByText("done")).toBeInTheDocument();
});
