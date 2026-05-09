import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";
import LauncherPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function renderLauncher() {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
      <LauncherPage />
    </NextIntlClientProvider>,
  );
}

describe("LauncherPage", () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("renders the launcher head and prototype fallback projects", async () => {
    renderLauncher();
    expect(screen.getByRole("heading", { name: "Recent projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New project/ }).className).toContain("bg-(--blue)");
    await waitFor(() => expect(screen.getByText("Tokyo Essay")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Create another project" })).toBeInTheDocument();
  });

  it("shows recent projects from the sidecar", async () => {
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
          alignment_state: "pending",
          palette_seed: "demo",
        },
      ],
    });
    renderLauncher();
    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
    const card = screen.getByText("Demo").closest("button");
    expect(card?.className).toContain("bg-(--bg-2)");
    expect(card).toHaveTextContent("3 media");
    expect(screen.getByText("pending")).toBeInTheDocument();
  });
});
