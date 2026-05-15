import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentProjectCard, RecentProjectsPage, RuntimeHealthResponse } from "@vc/shared-schemas";
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

function projectsPage(items: RecentProjectCard[], pageIndex = 0, pageSize = 6): RecentProjectsPage {
  return {
    items,
    pagination: {
      page_index: pageIndex,
      page_size: pageSize,
      total_count: items.length,
      total_pages: items.length > pageSize ? Math.ceil(items.length / pageSize) : items.length === 0 ? 0 : 1,
    },
  };
}

function mockServer({
  recent,
  recentOk = true,
  pages,
}: {
  recent: RecentProjectCard[];
  recentOk?: boolean;
  pages?: Record<string, RecentProjectsPage>;
}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/projects?page_size=") && (!init || init.method === undefined)) {
      const pageIndex = new URL(url, "http://test").searchParams.get("page_index") ?? "0";
      return {
        ok: recentOk,
        json: async () => pages?.[pageIndex] ?? projectsPage(recent, Number(pageIndex)),
      } as Response;
    }
    if (url.includes("/projects/") && init?.method === "DELETE") {
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    }
    if (url.endsWith("/play") && init?.method === "POST") {
      return { ok: true, json: async () => ({ ok: true }) } as Response;
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
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/server/projects?page_size=6&page_index=0"));
    expect(screen.queryByText("Tokyo Essay")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create another project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open folder…" })).not.toBeInTheDocument();
  });

  it("keeps prototype projects hidden when recent projects cannot be loaded", async () => {
    mockServer({ recent: [], recentOk: false });
    renderLauncher();
    await waitFor(() => expect(screen.getByText("Recent projects unavailable")).toBeInTheDocument());
    expect(screen.queryByText("Tokyo Essay")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create another project" })).not.toBeInTheDocument();
  });

  it("shows project-id cards from the sidecar without raw paths", async () => {
    mockServer({
      recent: [
        {
          project_id: "p_demo",
          name: "Demo",
          last_render_at: "2026-05-07T00:00:00Z",
          voice_duration: "",
          sentence_count: 0,
          media_count: 3,
          alignment_state: "pending",
          status: "ready",
          has_unrendered_changes: true,
        },
      ],
    });
    renderLauncher();
    await waitFor(() => expect(screen.getByText("Demo")).toBeInTheDocument());
    const card = screen.getByText("Demo").closest("article");
    expect(card?.className).toContain("bg-(--bg-2)");
    expect(card).toHaveTextContent("3 media");
    expect(card).not.toHaveTextContent("p_demo");
    expect(card).not.toHaveTextContent("E:\\projects\\demo");
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("hides opened metadata when last render time is null", async () => {
    mockServer({
      recent: [
        {
          project_id: "p_no_time",
          name: "No Time",
          last_render_at: null,
          voice_duration: "00:45",
          sentence_count: 4,
          media_count: 1,
          alignment_state: "aligned",
          status: "ready",
          has_unrendered_changes: false,
        },
      ],
    });
    renderLauncher();
    await waitFor(() => expect(screen.getByText("No Time")).toBeInTheDocument());
    const card = screen.getByText("No Time").closest("article");
    expect(card).not.toHaveTextContent("opened");
  });

  it("plays the latest successful render from a project card", async () => {
    mockServer({
      recent: [
        {
          project_id: "p_done",
          name: "Rendered",
          last_render_at: "2026-05-07T00:00:00Z",
          voice_duration: "01:10",
          sentence_count: 12,
          media_count: 3,
          alignment_state: "aligned",
          status: "ready",
          has_unrendered_changes: false,
          latest_render_id: "r_latest",
          latest_render_status: "done",
          render_status_tag: "rendered",
        },
      ],
    });
    renderLauncher();
    fireEvent.click(await screen.findByRole("button", { name: "Play render" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/server/projects/p_done/renders/r_latest/play",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("routes new projects directly to setup", async () => {
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    expect(push).toHaveBeenCalledWith("/setup");
  });

  it("opens project cards in the editor route", async () => {
    mockServer({
      recent: [
        {
          project_id: "p_editor",
          name: "Editor Ready",
          last_render_at: "2026-05-07T00:00:00Z",
          voice_duration: "00:45",
          sentence_count: 4,
          media_count: 1,
          alignment_state: "pending",
          status: "ready",
          has_unrendered_changes: false,
          render_status_tag: "unrendered",
        },
      ],
    });
    renderLauncher();
    fireEvent.click(await screen.findByRole("button", { name: "Open Editor Ready" }));
    expect(push).toHaveBeenCalledWith("/editor/p_editor");
  });

  it("deletes a project card and reloads the current page", async () => {
    mockServer({
      recent: [
        {
          project_id: "p_delete",
          name: "Delete Me",
          last_render_at: "2026-05-07T00:00:00Z",
          voice_duration: "00:45",
          sentence_count: 4,
          media_count: 1,
          alignment_state: "pending",
          status: "ready",
          has_unrendered_changes: false,
          render_status_tag: "unrendered",
        },
      ],
    });
    renderLauncher();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Delete Me" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/server/projects/p_delete",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("switches recent project pages", async () => {
    mockServer({
      recent: [],
      pages: {
        "0": {
          items: [
            {
              project_id: "p_page_one",
              name: "Page One",
              last_render_at: "2026-05-07T00:00:00Z",
              voice_duration: "00:45",
              sentence_count: 4,
              media_count: 1,
              alignment_state: "aligned",
              status: "ready",
              has_unrendered_changes: false,
              render_status_tag: "rendered",
            },
          ],
          pagination: { page_index: 0, page_size: 1, total_count: 2, total_pages: 2 },
        },
        "1": {
          items: [
            {
              project_id: "p_page_two",
              name: "Page Two",
              last_render_at: "2026-05-06T00:00:00Z",
              voice_duration: "00:30",
              sentence_count: 3,
              media_count: 2,
              alignment_state: "pending",
              status: "ready",
              has_unrendered_changes: true,
              render_status_tag: "unrendered",
            },
          ],
          pagination: { page_index: 1, page_size: 1, total_count: 2, total_pages: 2 },
        },
      },
    });
    renderLauncher();
    expect(await screen.findByText("Page One")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page Two")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});
