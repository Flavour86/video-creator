import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentProject, RuntimeHealthResponse } from "@vc/shared-schemas";
import { dictionaries } from "@/lib/i18n/messages";
import LauncherPage from "./page";

const push = vi.fn();

const RUNTIME_STATUS: RuntimeHealthResponse = {
  status: "ok",
  version: "0.1.0",
  active_renders: 0,
  cached_projects: 1,
  sidecar: { status: "ready", address: "http://127.0.0.1:8787", version: "0.1.0" },
  node: { status: "ready", version: "22.4.1" },
  python: { status: "ready", version: "3.11.9" },
  ffmpeg: { status: "ready", version: "6.1.1" },
  cuda: { status: "ready", available: true, version: "12.8", gpu_label: "NVIDIA RTX" },
  whisperx: { status: "ready", model: "large-v3" },
};

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

function mockServer({
  createOk = true,
  createPayload = { project_id: "p_new_cut", path: "E:\\video-projects\\new-cut", name: "new-cut" },
  recent,
  recentOk = true,
}: {
  createOk?: boolean;
  createPayload?: unknown;
  recent: RecentProject[];
  recentOk?: boolean;
}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/projects/recent")) {
      return {
        ok: recentOk,
        json: async () => recent,
      } as Response;
    }
    if (url.endsWith("/projects/new-folder") && init?.method === "POST") {
      return {
        ok: createOk,
        status: createOk ? 200 : 409,
        json: async () => createPayload,
      } as Response;
    }
    if (url.endsWith("/health")) {
      return {
        ok: true,
        json: async () => RUNTIME_STATUS,
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });
}

describe("LauncherPage", () => {
  beforeEach(() => {
    push.mockReset();
    mockServer({ recent: [] });
  });

  it("renders the launcher head and empty project card without prototype fallback rows", async () => {
    renderLauncher();
    expect(screen.getByRole("heading", { name: "Recent projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New project/ }).className).toContain("bg-(--blue)");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/server/projects/recent"));
    expect(screen.queryByText("Tokyo Essay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another project" })).toBeInTheDocument();
  });

  it("keeps prototype projects hidden when recent projects cannot be loaded", async () => {
    mockServer({ recent: [], recentOk: false });
    renderLauncher();
    await waitFor(() => expect(screen.getByText("Recent projects unavailable")).toBeInTheDocument());
    expect(screen.queryByText("Tokyo Essay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another project" })).toBeInTheDocument();
  });

  it("shows recent projects from the sidecar", async () => {
    mockServer({
      recent: [
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

  it("opens the folder boundary instead of routing straight to setup", async () => {
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Choose a local folder" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Folder selection cancelled.")).toBeInTheDocument();
  });

  it("creates the selected folder before entering setup", async () => {
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "E:\\video-projects\\new-cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/setup?projectId=p_new_cut&path=E%3A%5Cvideo-projects%5Cnew-cut"),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/new-folder",
      expect.objectContaining({
        body: JSON.stringify({ path: "E:\\video-projects\\new-cut", name: "new-cut" }),
        method: "POST",
      }),
    );
  });

  it("keeps non-empty folder errors on the launcher", async () => {
    mockServer({
      createOk: false,
      createPayload: { error: { code: "NOT_EMPTY", message: "Project directory already exists.", details: {} } },
      recent: [],
    });
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "E:\\video-projects\\used" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(screen.getByText("Folder is not empty.")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
