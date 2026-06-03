import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { preparePage } from "./e2e-utils";

const PROJECT_ID = "p_v11_flow";
const RENDER_ID = "r-v11-final";
const PROJECT_PATH = "E:/video-projects/v11-flow";
const UPDATED_TRANSCRIPT_TEXT = "Integrated browser flow edited this transcript sentence.";
const BUG_SWEEP_EVIDENCE_DIR = path.resolve(process.cwd(), "..", "..", "docs", "designs", "bugs", "v1.1", "evidence");
const BUG_SWEEP_VIEWPORTS = [
  { name: "1920x1080", portrait: false, viewport: { width: 1920, height: 1080 } },
  { name: "1280x720", portrait: false, viewport: { width: 1280, height: 720 } },
  { name: "1080x1920", portrait: true, viewport: { width: 1080, height: 1920 } },
] as const;
type BugSweepViewport = (typeof BUG_SWEEP_VIEWPORTS)[number];

test.describe("v1.1 integrated editor flow", () => {
  test("edits v1.1 settings, autosaves, reloads, and opens render output", async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/server/") && response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await preparePage(page, "dark");
    await installMockWebSocket(page);
    const api = await mockIntegratedEditorApi(page);

    await page.goto(`/editor/${PROJECT_ID}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "v1.1 Integrated Flow" })).toBeVisible();

    await updateSubtitles(page);
    await updateWatermark(page);
    await updateTranscript(page);
    await updateBackgroundSchedule(page);

    await expect(page.getByLabel("Autosave saved")).toBeVisible();
    await captureEvidence(page, testInfo, "final-editor-state.png");
    await captureEvidence(editorInspector(page), testInfo, "inspector.png");
    await captureEvidence(editorTimeline(page), testInfo, "timeline.png");
    await captureEvidence(page.getByTestId("preview-stack"), testInfo, "preview.png");

    const savedBeforeReload = api.savedProject();
    assertSavedConfigContainsV1_1Edits(savedBeforeReload);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "v1.1 Integrated Flow" })).toBeVisible();
    await expect(page.getByTestId("transcript-sentence-text-2")).toContainText(UPDATED_TRANSCRIPT_TEXT);
    await expect(page.getByRole("button", { name: "timed ranges / 3 assets" })).toBeVisible();

    await page.getByRole("button", { name: /Render final \(ready\)/ }).click();
    await expect(page).toHaveURL(new RegExp(`/render/${PROJECT_ID}/${RENDER_ID}$`));
    await expect(page.getByRole("heading", { name: /v1\.1 Integrated Flow \/ 1080p final render/i })).toBeVisible();
    await expect(page.getByText("Final render ready")).toBeVisible();
    await captureEvidence(page, testInfo, "render-output.png");

    expect(api.renderStarts()).toBe(1);
    assertSavedConfigContainsV1_1Edits(api.savedProject());
    expect([...consoleErrors, ...failedResponses]).toEqual([]);
  });
});

test.describe("v1.1 bug inspection integrated evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.VC_BUG_SWEEP !== "1", "Set VC_BUG_SWEEP=1 to capture v1.1 bug-sweep integrated evidence.");

  for (const target of BUG_SWEEP_VIEWPORTS) {
    test.describe(target.name, () => {
      test.use({ viewport: target.viewport });

      test(`captures integrated regression ${target.name}`, async ({ page }) => {
        test.setTimeout(120_000);

        const consoleErrors: string[] = [];
        const failedResponses: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            consoleErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          consoleErrors.push(error.message);
        });
        page.on("response", (response) => {
          if (response.url().includes("/api/server/") && response.status() >= 400) {
            failedResponses.push(`${response.status()} ${response.url()}`);
          }
        });

        await preparePage(page, "dark");
        await installMockWebSocket(page);
        const api = await mockIntegratedEditorApi(page);

        await page.goto(`/editor/${PROJECT_ID}`, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: "v1.1 Integrated Flow" })).toBeVisible();
        if (target.portrait) {
          await page.getByRole("radio", { name: "9:16" }).click();
        }

        await updateSubtitles(page);
        await updateWatermark(page);
        await updateTranscript(page);
        await updateBackgroundSchedule(page);
        await expect(page.getByLabel("Autosave saved")).toBeVisible();
        assertSavedConfigContainsV1_1Edits(api.savedProject());

        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: "v1.1 Integrated Flow" })).toBeVisible();
        await expect(page.getByTestId("transcript-sentence-text-2")).toContainText(UPDATED_TRANSCRIPT_TEXT);
        await expect(page.getByRole("button", { name: "timed ranges / 3 assets" })).toBeVisible();

        await page.getByRole("button", { name: /Render final \(ready\)/ }).click();
        await expect(page).toHaveURL(new RegExp(`/render/${PROJECT_ID}/${RENDER_ID}$`));
        await expect(page.getByRole("heading", { name: /v1\.1 Integrated Flow \/ 1080p final render/i })).toBeVisible();
        await expect(page.getByText("Final render ready")).toBeVisible();
        await captureBugSweepEvidence(page, "integrated-flow", target);

        expect(api.renderStarts()).toBe(1);
        assertSavedConfigContainsV1_1Edits(api.savedProject());
        expect([...consoleErrors, ...failedResponses]).toEqual([]);
      });
    });
  }
});

async function updateSubtitles(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Subtitles$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Subtitles$/i });
  await expect(modal).toBeVisible();
  await modal.getByRole("combobox", { name: "Background" }).selectOption("block");
  await modal.locator("#editor-sub-color").fill("#ffcc00");
  await modal.locator("#editor-sub-bg-color").fill("#112233");
  await modal.getByLabel("Opacity", { exact: true }).fill("45");
  await modal.getByLabel("Radius", { exact: true }).fill("14");
  await waitForAutosave(page, async () => {
    await modal.getByRole("button", { name: "Apply" }).click();
  });
}

async function updateWatermark(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Watermark$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Watermark asset$/i });
  await expect(modal).toBeVisible();
  await waitForAutosave(page, async () => {
    await modal.getByRole("switch", { name: "Watermark enabled" }).click();
  });
  await waitForAutosave(page, async () => {
    await modal.getByLabel("Watermark POSX").fill("30");
  });
  await waitForAutosave(page, async () => {
    await modal.getByLabel("Watermark POSY").fill("70");
  });
  await modal.getByRole("button", { name: "Done" }).click();
}

async function updateTranscript(page: Page): Promise<void> {
  await page.getByRole("button", { name: /edit sentence 2/i }).click();
  const editor = page.getByRole("textbox", { name: /edit sentence 2 text/i });
  await expect(editor).toBeVisible();
  await editor.fill(UPDATED_TRANSCRIPT_TEXT);
  await waitForAutosave(page, async () => {
    await page.getByRole("button", { name: /confirm sentence 2 edit/i }).click();
  });
}

async function updateBackgroundSchedule(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Change Background$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Change background$/i });
  await expect(modal.getByTestId("background-coverage-grid")).toHaveAttribute("data-row-count", "3");
  await modal.getByLabel("End bg-red.png").fill("00:02");
  await waitForAutosave(page, async () => {
    await modal.getByRole("button", { name: "Save changes" }).click();
  });
}

async function waitForAutosave(page: Page, action: () => Promise<void>): Promise<void> {
  const save = page.waitForResponse((response) => (
    response.url().includes(`/api/server/projects/${PROJECT_ID}/config`)
      && response.request().method() === "PUT"
  ));
  await action();
  await save;
  await expect(page.getByLabel("Autosave saved")).toBeVisible();
}

function editorInspector(page: Page): Locator {
  return page.getByTestId("editor-layout-grid").locator("aside").nth(1);
}

function editorTimeline(page: Page): Locator {
  return page.getByTestId("timeline-waveform").locator("xpath=ancestor::section[1]");
}

async function captureEvidence(target: Page | Locator, testInfo: TestInfo, filename: string): Promise<void> {
  const evidenceDir = testInfo.outputPath("task-13-evidence");
  await mkdir(evidenceDir, { recursive: true });
  await target.screenshot({ path: path.join(evidenceDir, filename) });
}

async function captureBugSweepEvidence(target: Page | Locator, feature: string, viewport: BugSweepViewport): Promise<void> {
  await mkdir(BUG_SWEEP_EVIDENCE_DIR, { recursive: true });
  await target.screenshot({ path: path.join(BUG_SWEEP_EVIDENCE_DIR, `${feature}-${viewport.name}.png`) });
}

async function installMockWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      binaryType: BinaryType = "blob";
      bufferedAmount = 0;
      extensions = "";
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      protocol = "";
      readyState = MockWebSocket.CONNECTING;
      url: string;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        queueMicrotask(() => {
          this.readyState = MockWebSocket.OPEN;
          const event = new Event("open");
          this.onopen?.(event);
          this.dispatchEvent(event);
        });
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const event = new CloseEvent("close");
        this.onclose?.(event);
        this.dispatchEvent(event);
      }

      send() {}
    }

    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });
}

async function mockIntegratedEditorApi(page: Page) {
  let activeProject = structuredClone(INTEGRATED_PROJECT);
  let saveCounter = 0;
  let renderStartCounter = 0;

  await page.route("**/_next/image**", async (route) => {
    const url = new URL(route.request().url());
    const filename = url.searchParams.get("url") ?? "image";
    await route.fulfill({ body: buildMediaSvg(filename), contentType: "image/svg+xml" });
  });

  await page.route("**/api/server/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;

    if (pathname === `/api/server/projects/${PROJECT_ID}/inspect` && method === "POST") {
      await route.fulfill({ json: { path: PROJECT_PATH } });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/alignment` && method === "GET") {
      await route.fulfill({ json: INTEGRATED_ALIGNMENT });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/config` && method === "GET") {
      await route.fulfill({
        json: {
          config: activeProject,
          config_hash: `h-v11-${saveCounter}`,
          has_unrendered_changes: true,
          last_rendered_config_hash: "h-rendered-before-v11",
          project_id: PROJECT_ID,
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/config` && method === "PUT") {
      const payload = request.postDataJSON() as { config?: typeof INTEGRATED_PROJECT };
      if (payload.config) {
        activeProject = payload.config;
        saveCounter += 1;
      }
      await route.fulfill({
        json: {
          config_hash: `h-v11-${saveCounter}`,
          has_unrendered_changes: true,
          project_id: PROJECT_ID,
          saved_at: "2026-06-03T00:00:00.000Z",
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/render` && method === "POST") {
      renderStartCounter += 1;
      await route.fulfill({ json: { output_path: "renders/v11-final.mp4", render_id: RENDER_ID } });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/history` && method === "GET") {
      await route.fulfill({ json: [renderHistoryRow()] });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/render-cache` && method === "GET") {
      await route.fulfill({ json: { cached_count: 3, state: "warm", total_count: 3 } });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/render/${RENDER_ID}` && method === "GET") {
      await route.fulfill({ body: "", contentType: "video/mp4" });
      return;
    }
    if (pathname === "/api/server/projects/media-file" || pathname === "/api/server/projects/thumb" || pathname === "/api/server/uploads/thumb") {
      const filename = url.searchParams.get("filename") ?? "media";
      await route.fulfill({ body: buildMediaSvg(filename), contentType: "image/svg+xml" });
      return;
    }
    if (pathname === "/api/server/uploads/media-file") {
      await route.fulfill({ body: "", contentType: "video/mp4" });
      return;
    }
    if (pathname === "/api/server/projects/audio") {
      await route.fulfill({ body: "", contentType: "audio/mpeg" });
      return;
    }
    if (pathname === "/api/server/uploads" && method === "POST") {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fallback();
  });

  return {
    renderStarts: () => renderStartCounter,
    savedProject: () => activeProject,
  };
}

function assertSavedConfigContainsV1_1Edits(project: typeof INTEGRATED_PROJECT): void {
  expect(project.subtitles?.style.color).toBe("#ffcc00");
  expect(project.subtitles?.style.bg_color).toBe("#112233");
  expect(project.subtitles?.style.bg_opacity).toBe(45);
  expect(project.subtitles?.style.bg_radius).toBe(14);
  expect(project.watermark?.mediaId).toBe("wm-logo.png");
  expect(project.watermark?.posX).toBe(30);
  expect(project.watermark?.posY).toBe(70);
  expect(project.transcript?.sentences?.[1]?.text).toBe(UPDATED_TRANSCRIPT_TEXT);
  const background = project.layers.find((layer) => layer.kind === "bg");
  expect(background?.items[0]?.mediaIds).toEqual(["bg-red.png", "bg-video.mp4", "bg-blue.png"]);
  expect(background?.items[0]?.schedule).toEqual([
    { end: 2, id: "seg-bg-red.png", lockedDuration: false, mediaId: "bg-red.png", start: 0 },
    { end: 6, id: "seg-bg-video.mp4", lockedDuration: true, mediaId: "bg-video.mp4", start: 2 },
    { end: 12, id: "seg-bg-blue.png", lockedDuration: false, mediaId: "bg-blue.png", start: 6 },
  ]);
}

function renderHistoryRow() {
  return {
    artifacts: [],
    capabilities: { reveal_in_explorer_supported: false },
    completed_at: "2026-06-03T00:00:12.000Z",
    created_at: "2026-06-03T00:00:00.000Z",
    duration_s: 12,
    events: [
      { detail_json: "{\"current_frame\":360}", stage: "done", state: "done" },
    ],
    file_size: 4_800_000,
    finished_at: "2026-06-03T00:00:12.000Z",
    id: RENDER_ID,
    message: "Render complete",
    output_exists: true,
    output_path: "E:/video-projects/v11-flow/renders/v11-final.mp4",
    preset: "final",
    render_id: RENDER_ID,
    resolution: "1920x1080",
    started_at: "2026-06-03T00:00:00.000Z",
    status: "done",
  };
}

function buildMediaSvg(label: string): string {
  const text = escapeXml(path.basename(label).slice(0, 28));
  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"180\" viewBox=\"0 0 320 180\">",
    "<rect width=\"320\" height=\"180\" fill=\"#203040\"/>",
    "<rect x=\"18\" y=\"18\" width=\"284\" height=\"144\" rx=\"10\" fill=\"#386641\"/>",
    `<text x=\"160\" y=\"94\" text-anchor=\"middle\" fill=\"#fefae0\" font-family=\"Arial\" font-size=\"18\">${text}</text>`,
    "</svg>",
  ].join("");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mediaAsset(id: string, kind: "image" | "video" | "watermark_image", role: "background" | "watermark", duration: number | null = null) {
  return {
    created_at: "2026-06-03T00:00:00.000Z",
    dimensions: { height: 1080, width: 1920 },
    duration,
    hash: `hash-${id}`,
    id,
    import_mode: "copy",
    imported_at: "2026-06-03T00:00:00.000Z",
    kind,
    name: id,
    path: `media/${id}`,
    role,
    size: kind === "video" ? 4_800_000 : 800_000,
    thumb_path: `uploads/thumb/${id}.svg`,
  };
}

const INTEGRATED_ALIGNMENT = {
  cache_hit: true,
  sentences: [
    { confidence_avg: 0.97, end_s: 4, index: 1, start_s: 0, text: "Opening integrated browser flow sentence." },
    { confidence_avg: 0.96, end_s: 8, index: 2, start_s: 4, text: "This transcript sentence will be edited." },
    { confidence_avg: 0.95, end_s: 12, index: 3, start_s: 8, text: "The render keeps scheduled backgrounds." },
  ],
  words: [],
};

const INTEGRATED_PROJECT = {
  audio: "voice.wav",
  layers: [
    { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
    {
      id: "bg-main",
      items: [{
        crossfade: 0,
        end: 12,
        id: "bg-scheduled",
        mediaIds: ["bg-red.png", "bg-video.mp4", "bg-blue.png"],
        motion: { easing: "linear", kind: "none" },
        schedule: [
          { end: 4, id: "seg-bg-red.png", lockedDuration: false, mediaId: "bg-red.png", start: 0 },
          { end: 8, id: "seg-bg-video.mp4", lockedDuration: true, mediaId: "bg-video.mp4", start: 4 },
          { end: 12, id: "seg-bg-blue.png", lockedDuration: false, mediaId: "bg-blue.png", start: 8 },
        ],
        sentences: [1, 3] as [number, number],
        start: 0,
        transitions: { in: "cut", out: "cut" },
      }],
      kind: "bg",
      name: "Background",
    },
  ],
  media: [
    mediaAsset("bg-red.png", "image", "background"),
    mediaAsset("bg-video.mp4", "video", "background", 4),
    mediaAsset("bg-blue.png", "image", "background"),
    mediaAsset("wm-logo.png", "watermark_image", "watermark"),
  ],
  name: "v1.1 Integrated Flow",
  output: { fps: 30, height: 1080, preset: "draft", resolution: "1080p", width: 1920 },
  subtitles: {
    burn_in: true,
    style: {
      bg_color: "#000000",
      bg_opacity: 62,
      bg_radius: 8,
      bg_style: "shadow",
      color: "#ffffff",
      font: "Arial",
      max_chars_per_line: 42,
      position: "bottom",
      size: 42,
    },
  },
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: INTEGRATED_ALIGNMENT.sentences },
  version: 1,
  watermark: null,
};
