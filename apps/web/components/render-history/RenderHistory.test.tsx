import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { RenderHistory } from "./RenderHistory";

const openMock = vi.fn();

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: "r-1",
        output_path: "E:/project/.vc/drafts/r-1.mp4",
        preset: "draft",
        started_at: "2026-05-07T12:00:00Z",
        finished_at: "2026-05-07T12:00:02Z",
        duration_s: 2.1,
        status: "done",
        message: null,
        file_size: 2048,
      },
    ],
  });
  openMock.mockReset();
  vi.stubGlobal("open", openMock);
});

it("renders render history rows", async () => {
  render(<RenderHistory projectId="p-1" />);

  await waitFor(() => {
    expect(screen.getByText("E:/project/.vc/drafts/r-1.mp4")).toBeInTheDocument();
  });
  expect(screen.getByText("draft")).toBeInTheDocument();
  expect(screen.getByText("playable")).toBeInTheDocument();
  expect(screen.getByText(/2.1s/)).toBeInTheDocument();
});

it("calls reveal endpoint when open is clicked", async () => {
  render(<RenderHistory projectId="p-1" />);

  const button = await screen.findByRole("button", { name: /open r-1/i });
  fireEvent.click(button);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/p-1/renders/r-1/reveal",
      { method: "POST" },
    );
  });
});

it("opens playback URL when play is clicked", async () => {
  render(<RenderHistory projectId="p-1" />);

  const button = await screen.findByRole("button", { name: /play r-1/i });
  fireEvent.click(button);

  await waitFor(() => {
    expect(openMock).toHaveBeenCalledWith(
      "/api/server/projects/p-1/render/r-1",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
