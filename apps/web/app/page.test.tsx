import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LauncherPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LauncherPage", () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("renders the title", async () => {
    render(<LauncherPage />);
    expect(screen.getByText("Video Creator")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No projects yet - create one to get started.")).toBeInTheDocument());
  });

  it("shows recent projects", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          path: "E:\\projects\\demo",
          name: "Demo",
          last_opened_at: "2026-05-07T00:00:00Z",
          voice_duration: "",
          sentence_count: 0,
          media_count: 3,
        },
      ],
    });
    render(<LauncherPage />);
    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
    expect(screen.getByText(/3 media/)).toBeInTheDocument();
  });
});
