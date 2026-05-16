import { expect, type Page } from "@playwright/test";
import type { RecentProjectCard, RecentProjectsPage, SetupDraft, SetupSubtitleGenerationResult } from "@vc/shared-schemas";

export type ThemeMode = "dark" | "light";
export type UploadFilePayload = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

export type MockSequenceItem<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; status?: number };

export type SetupApiState = {
  alignmentCalls: number;
  createProjectCalls: number;
  createProjectSnapshot: SetupDraft | null;
  draft: SetupDraft;
  setupId: string;
  subtitleCalls: number;
};

export async function preparePage(page: Page, theme: ThemeMode = "dark"): Promise<void> {
  await page.addInitScript(({ themeValue }) => {
    window.localStorage.setItem("vc.theme", themeValue);
    window.localStorage.setItem("vc.language", "en");
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}";
    document.documentElement.appendChild(style);
  }, { themeValue: theme });
}

export function makeUpload(name: string, mimeType: string, contents = "fixture"): UploadFilePayload {
  return {
    buffer: Buffer.from(contents, "utf-8"),
    mimeType,
    name,
  };
}

export function nowMinusMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function projectCard(
  values: Pick<RecentProjectCard, "project_id" | "name"> & Partial<RecentProjectCard>,
): RecentProjectCard {
  return {
    alignment_state: "pending",
    has_unrendered_changes: false,
    last_render_at: null,
    media_count: 0,
    sentence_count: 0,
    status: "ready",
    voice_duration: "00:00",
    ...values,
  };
}

export function projectsPage(
  items: RecentProjectCard[],
  pageIndex: number,
  totalPages: number,
  pageSize = 6,
): RecentProjectsPage {
  return {
    items,
    pagination: {
      page_index: pageIndex,
      page_size: pageSize,
      total_count: pageSize * totalPages,
      total_pages: totalPages,
    },
  };
}

export function setupDraft(values: Partial<SetupDraft> = {}): SetupDraft {
  return {
    alignment: {
      audio_duration: 0,
      cache_hit: false,
      device: "cuda fp16",
      hash: "",
      model: "large-v3",
      status: "pending",
    },
    name: "",
    output_preset: "draft",
    path: "E:/video-projects/e2e-flow",
    project_id: undefined,
    subtitle_generation: {
      cache_state: "unknown",
      cue_count: 0,
      error_message: null,
      status: "ready",
      total_duration_s: 0,
    },
    transcript: null,
    voice: null,
    ...values,
  };
}

type SetupApiMockOptions = {
  alignmentSequence?: Array<MockSequenceItem<SetupDraft["alignment"]>>;
  createProjectId?: string;
  draft: SetupDraft;
  onVoiceUpload?: (state: SetupApiState) => void;
  onTranscriptUpload?: (state: SetupApiState) => void;
  onWatermarkUpload?: (state: SetupApiState) => void;
  subtitleSequence?: Array<MockSequenceItem<SetupSubtitleGenerationResult>>;
};

type LauncherApiMockOptions = {
  byPageIndex: Record<number, RecentProjectsPage>;
  onDeleteProject?: (projectId: string) => void;
};

export async function mockLauncherApi(page: Page, options: LauncherApiMockOptions): Promise<void> {
  await page.route("**/api/server/projects**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/server/projects" && method === "GET") {
      const pageIndex = Number(url.searchParams.get("page_index") ?? "0");
      const response = options.byPageIndex[pageIndex] ?? options.byPageIndex[0];
      await route.fulfill({ json: response });
      return;
    }

    const match = path.match(/^\/api\/server\/projects\/([^/]+)$/);
    if (match?.[1] && method === "DELETE") {
      options.onDeleteProject?.(decodeURIComponent(match[1]));
      await route.fulfill({ json: { ok: true } });
      return;
    }

    if (path.includes("/renders/") && path.endsWith("/file")) {
      await route.fulfill({ body: "", contentType: "video/mp4" });
      return;
    }

    if (path.includes("/thumb")) {
      await route.fulfill({
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
          "base64",
        ),
        contentType: "image/png",
      });
      return;
    }

    await route.fallback();
  });
}

export async function mockSetupApi(page: Page, options: SetupApiMockOptions): Promise<SetupApiState> {
  const state: SetupApiState = {
    alignmentCalls: 0,
    createProjectCalls: 0,
    createProjectSnapshot: null,
    draft: options.draft,
    setupId: "setup_e2e",
    subtitleCalls: 0,
  };

  let subtitleIndex = 0;
  let alignmentIndex = 0;

  await page.route("**/api/server/health", async (route) => {
    await route.fulfill({ json: { status: "ok", version: "0.1.0" } });
  });

  await page.route("**/api/server/setup/drafts**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/server/setup/drafts" && method === "POST") {
      await route.fulfill({
        json: { draft: state.draft, setup_id: state.setupId },
      });
      return;
    }

    if (path === `/api/server/setup/drafts/${state.setupId}` && method === "PATCH") {
      const rawBody = request.postData();
      let payload: Record<string, unknown> | null = null;
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }
      if (payload?.name && typeof payload.name === "string") {
        state.draft = { ...state.draft, name: payload.name };
      }
      if (payload?.output_preset && typeof payload.output_preset === "string") {
        state.draft = { ...state.draft, output_preset: payload.output_preset as SetupDraft["output_preset"] };
      }
      await route.fulfill({
        json: { draft: state.draft, setup_id: state.setupId },
      });
      return;
    }

    if (path.endsWith(`/setup/drafts/${state.setupId}/artifacts/voice`) && method === "POST") {
      options.onVoiceUpload?.(state);
      await route.fulfill({
        json: { draft: state.draft, setup_id: state.setupId },
      });
      return;
    }

    if (path.endsWith(`/setup/drafts/${state.setupId}/artifacts/transcript`) && method === "POST") {
      options.onTranscriptUpload?.(state);
      await route.fulfill({
        json: { draft: state.draft, setup_id: state.setupId },
      });
      return;
    }

    if (path.endsWith(`/setup/drafts/${state.setupId}/artifacts/watermark`) && method === "POST") {
      options.onWatermarkUpload?.(state);
      await route.fulfill({
        json: { draft: state.draft, setup_id: state.setupId },
      });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/server/subtitle", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    state.subtitleCalls += 1;
    const next = options.subtitleSequence?.[subtitleIndex] ?? { ok: true, value: state.draft.subtitle_generation };
    subtitleIndex += 1;
    if (!next.ok) {
      await route.fulfill({
        json: { error: { code: "SUBTITLE_FAILED", message: next.message } },
        status: next.status ?? 500,
      });
      return;
    }
    state.draft = {
      ...state.draft,
      subtitle_generation: next.value,
    };
    await route.fulfill({ json: next.value });
  });

  await page.route("**/api/server/subtitle/alignment", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    state.alignmentCalls += 1;
    const next = options.alignmentSequence?.[alignmentIndex] ?? { ok: true, value: state.draft.alignment };
    alignmentIndex += 1;
    if (!next.ok) {
      await route.fulfill({
        json: { error: { code: "ALIGNMENT_FAILED", message: next.message } },
        status: next.status ?? 500,
      });
      return;
    }
    state.draft = {
      ...state.draft,
      alignment: next.value,
    };
    await route.fulfill({
      json: {
        alignment: next.value,
        corrections_applied: next.value.status === "aligned" ? 4 : null,
        status: next.value.status === "aligned" ? "succeeded" : next.value.status,
      },
    });
  });

  await page.route("**/api/server/projects", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    state.createProjectCalls += 1;
    state.createProjectSnapshot = structuredClone(state.draft);
    await route.fulfill({
      json: { project_id: options.createProjectId ?? "p_created_e2e" },
    });
  });

  return state;
}

export function stepDoneLocator(page: Page, stepName: string) {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("button", { name: new RegExp(`^${escaped}\\b`) }).locator("svg");
}

export async function expectStepDone(page: Page, stepName: string): Promise<void> {
  await expect(stepDoneLocator(page, stepName)).toBeVisible();
}
