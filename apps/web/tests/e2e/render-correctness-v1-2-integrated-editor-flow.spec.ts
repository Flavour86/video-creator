import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { preparePage } from "./e2e-utils";

const PROJECT_ID = "p_v12_flow";
const RENDER_ID = "r-v12-final";
const PROJECT_PATH = "E:/video-projects/v12-flow";
const TASK09_VIEWPORTS = [
  {
    name: "1920x1080",
    portrait: false,
    viewport: { height: 1080, width: 1920 },
  },
  { name: "1280x720", portrait: false, viewport: { height: 720, width: 1280 } },
  {
    name: "1080x1920",
    portrait: true,
    viewport: { height: 1920, width: 1080 },
  },
] as const;

type Task09Viewport = (typeof TASK09_VIEWPORTS)[number];

test.describe("v1.2 integrated editor flow", () => {
  test.describe.configure({ mode: "serial" });

  for (const target of TASK09_VIEWPORTS) {
    test.describe(target.name, () => {
      test.use({ viewport: target.viewport });

      test(`creates, persists, and renders v1.2 editor config at ${target.name}`, async ({
        page,
      }, testInfo) => {
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
          if (
            response.url().includes("/api/server/") &&
            response.status() >= 400
          ) {
            failedResponses.push(`${response.status()} ${response.url()}`);
          }
        });

        await preparePage(page, "dark");
        await installMockWebSocket(page);
        const api = await mockIntegratedEditorApi(page);

        await page.goto(`/editor/${PROJECT_ID}`, { waitUntil: "networkidle" });
        await expect(
          page.getByRole("heading", { name: "v1.2 Integrated Flow" }),
        ).toBeVisible();
        if (target.portrait) {
          await page.getByRole("radio", { name: "9:16" }).click();
        }

        await createManualBackgroundGap(page);
        await setSubtitleMaxCharacters(page, testInfo, target);
        await expect(page.getByLabel("Autosave saved")).toBeVisible();
        assertSavedConfigContainsV1_2Edits(api.savedProject());

        await page.reload({ waitUntil: "networkidle" });
        await expect(
          page.getByRole("heading", { name: "v1.2 Integrated Flow" }),
        ).toBeVisible();
        if (target.portrait) {
          await page.getByRole("radio", { name: "9:16" }).click();
        }

        await expect(
          page.getByRole("button", { name: "timed ranges / 4 assets" }),
        ).toBeVisible();
        await captureEvidence(page, testInfo, target, "final-editor-state.png");
        await assertReloadedBackgroundModal(page, testInfo, target);
        await assertReloadedSubtitleModal(page, testInfo, target);
        await assertWholeSecondTransport(page, testInfo, target);

        await page
          .getByRole("button", { name: /Render final \(ready\)/ })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/render/${PROJECT_ID}/${RENDER_ID}$`),
        );
        await expect(
          page.getByRole("heading", {
            name: /v1\.2 Integrated Flow \/ 1080p final render/i,
          }),
        ).toBeVisible();
        await expect(page.getByText("Final render ready")).toBeVisible();
        await captureEvidence(page, testInfo, target, "render-output.png");

        expect(api.renderStarts()).toBe(1);
        assertSavedConfigContainsV1_2Edits(api.savedProject());
        expect([...consoleErrors, ...failedResponses]).toEqual([]);
      });
    });
  }
});

async function createManualBackgroundGap(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Change Background$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Change background$/i });
  await expect(modal.getByTestId("background-coverage-grid")).toHaveAttribute(
    "data-row-count",
    "4",
  );
  await expect(modal.getByRole("button", { name: /auto fill/i })).toHaveCount(
    0,
  );

  const ramenStart = modal.getByLabel("Start ramen-shop.jpg");
  const ramenEnd = modal.getByLabel("End ramen-shop.jpg");
  await ramenStart.fill("00:00");
  await ramenStart.blur();
  await ramenEnd.fill("00:00");
  await ramenEnd.blur();
  await expect(ramenStart).toHaveValue("00:00");
  await expect(ramenEnd).toHaveValue("00:00");
  await expect(modal.getByLabel("Start station-intro.mp4")).toHaveValue(
    "00:40",
  );
  await expect(modal.getByLabel("End station-intro.mp4")).toHaveValue("00:52");

  await waitForAutosave(page, async () => {
    await modal.getByRole("button", { name: "Save changes" }).click();
  });
}

async function setSubtitleMaxCharacters(
  page: Page,
  testInfo: TestInfo,
  target: Task09Viewport,
): Promise<void> {
  await page.getByRole("button", { name: /^Subtitles$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Subtitles$/i });
  await expect(modal).toBeVisible();
  const maxChars = modal.getByLabel("Max characters per line");

  await maxChars.click();
  await maxChars.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("65");
  await expect(maxChars).toHaveValue("65");

  await maxChars.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("70");
  await expect(maxChars).toHaveValue("70");
  const cueLines = modal.getByTestId("subtitles-preview-cue").locator("div");
  await expect(cueLines).toHaveCount(2);
  await expect(cueLines.nth(0)).toHaveText(
    "This subtitle preview follows your style and stays inside the",
  );
  await expect(cueLines.nth(1)).toHaveText("safe zone.");
  await captureEvidence(
    modal.getByTestId("subtitles-live-preview"),
    testInfo,
    target,
    "subtitle-preview-manual-70.png",
  );
  await modal.locator("div.overflow-y-auto").evaluate((node) => {
    node.scrollTop = 180;
  });
  await captureEvidence(
    modal,
    testInfo,
    target,
    "subtitle-modal-manual-70.png",
  );

  await maxChars.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("20");
  await expect(maxChars).toHaveValue("20");
  await waitForAutosave(page, async () => {
    await modal.getByRole("button", { name: "Apply" }).click();
  });
}

async function assertReloadedBackgroundModal(
  page: Page,
  testInfo: TestInfo,
  target: Task09Viewport,
): Promise<void> {
  await page.getByRole("button", { name: /^Change Background$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Change background$/i });
  await expect(modal.getByTestId("background-coverage-grid")).toHaveAttribute(
    "data-row-count",
    "4",
  );
  await expect(modal.getByRole("button", { name: /auto fill/i })).toHaveCount(
    0,
  );
  await expect(modal.getByLabel("Start neon-lights.jpg")).toHaveValue("00:00");
  await expect(modal.getByLabel("End neon-lights.jpg")).toHaveValue("00:30");
  await expect(modal.getByLabel("Start ramen-shop.jpg")).toHaveValue("00:00");
  await expect(modal.getByLabel("End ramen-shop.jpg")).toHaveValue("00:00");
  await expect(modal.getByLabel("Start station-intro.mp4")).toHaveValue(
    "00:40",
  );
  await expect(modal.getByLabel("End station-intro.mp4")).toHaveValue("00:52");
  await expect(modal.getByLabel("Start tokyo-skyline.jpg")).toHaveValue(
    "00:52",
  );
  await expect(modal.getByLabel("End tokyo-skyline.jpg")).toHaveValue("15:42");
  await captureEvidence(modal, testInfo, target, "background-modal.png");
  await modal.getByRole("button", { name: "Cancel" }).click();
}

async function assertReloadedSubtitleModal(
  page: Page,
  testInfo: TestInfo,
  target: Task09Viewport,
): Promise<void> {
  await page.getByRole("button", { name: /^Subtitles$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Subtitles$/i });
  await expect(modal.getByLabel("Max characters per line")).toHaveValue("20");
  await expect(modal.getByTestId("subtitles-preview-cue")).toBeVisible();
  await captureEvidence(modal, testInfo, target, "subtitle-modal.png");
  await modal.getByRole("button", { name: "Cancel" }).click();
}

async function assertWholeSecondTransport(
  page: Page,
  testInfo: TestInfo,
  target: Task09Viewport,
): Promise<void> {
  await setPlaybackTime(page, 38.399);
  const previewStack = page.getByTestId("preview-stack");
  await expect(previewStack.getByText("00:38")).toBeVisible();
  await expect(previewStack.getByText("15:42")).toBeVisible();
  await expect(previewStack.getByText(/00:38\.\d|15:42\.\d/)).toHaveCount(0);
  await captureEvidence(
    previewStack,
    testInfo,
    target,
    "preview-transport.png",
  );
}

async function setPlaybackTime(page: Page, targetTime: number): Promise<void> {
  await page.evaluate((time) => {
    const audio = document.querySelector(
      "[data-testid='editor-audio']",
    ) as HTMLAudioElement | null;
    if (!audio) return;
    try {
      audio.currentTime = time;
      audio.dispatchEvent(new Event("timeupdate"));
    } catch {
      // Audio metadata is mocked in E2E; a failed seek should not hide the UI assertion.
    }
  }, targetTime);
}

async function waitForAutosave(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const save = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/server/projects/${PROJECT_ID}/config`) &&
      response.request().method() === "PUT",
  );
  await action();
  await save;
  await expect(page.getByLabel("Autosave saved")).toBeVisible();
}

async function captureEvidence(
  target: Page | Locator,
  testInfo: TestInfo,
  viewport: Task09Viewport,
  filename: string,
): Promise<void> {
  const evidenceDir = testInfo.outputPath("task-09-evidence");
  await mkdir(evidenceDir, { recursive: true });
  const outputPath = path.join(evidenceDir, `${viewport.name}-${filename}`);
  if (isLocator(target)) {
    await target.waitFor({ state: "visible" });
    await target.screenshot({ path: outputPath });
    return;
  }
  await target.screenshot({ path: outputPath });
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
    await route.fulfill({
      body: buildMediaSvg(filename),
      contentType: "image/svg+xml",
    });
  });

  await page.route("**/api/server/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;

    if (
      pathname === `/api/server/projects/${PROJECT_ID}/inspect` &&
      method === "POST"
    ) {
      await route.fulfill({ json: { path: PROJECT_PATH } });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/alignment` &&
      method === "GET"
    ) {
      await route.fulfill({ json: INTEGRATED_ALIGNMENT });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/config` &&
      method === "GET"
    ) {
      await route.fulfill({
        json: {
          config: activeProject,
          config_hash: `h-v12-${saveCounter}`,
          has_unrendered_changes: true,
          last_rendered_config_hash: "h-rendered-before-v12",
          project_id: PROJECT_ID,
        },
      });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/config` &&
      method === "PUT"
    ) {
      const payload = request.postDataJSON() as {
        config?: typeof INTEGRATED_PROJECT;
      };
      if (payload.config) {
        activeProject = payload.config;
        saveCounter += 1;
      }
      await route.fulfill({
        json: {
          config_hash: `h-v12-${saveCounter}`,
          has_unrendered_changes: true,
          project_id: PROJECT_ID,
          saved_at: "2026-06-05T00:00:00.000Z",
        },
      });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/render` &&
      method === "POST"
    ) {
      renderStartCounter += 1;
      await route.fulfill({
        json: { output_path: "renders/v12-final.mp4", render_id: RENDER_ID },
      });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/history` &&
      method === "GET"
    ) {
      await route.fulfill({ json: [renderHistoryRow()] });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/render-cache` &&
      method === "GET"
    ) {
      await route.fulfill({
        json: {
          cached_count: 4,
          project_id: PROJECT_ID,
          state: "warm",
          total_count: 4,
        },
      });
      return;
    }
    if (
      pathname === `/api/server/projects/${PROJECT_ID}/render/${RENDER_ID}` &&
      method === "GET"
    ) {
      await route.fulfill({ body: "", contentType: "video/mp4" });
      return;
    }
    if (
      pathname === "/api/server/projects/media-file" ||
      pathname === "/api/server/projects/thumb" ||
      pathname === "/api/server/uploads/thumb"
    ) {
      const filename = url.searchParams.get("filename") ?? "media";
      await route.fulfill({
        body: buildMediaSvg(filename),
        contentType: "image/svg+xml",
      });
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

function assertSavedConfigContainsV1_2Edits(
  project: typeof INTEGRATED_PROJECT,
): void {
  expect(project.subtitles?.style.max_chars_per_line).toBe(20);
  const background = project.layers.find((layer) => layer.kind === "bg");
  const backgroundItem = background?.items.find(
    (item) => "mediaIds" in item && Array.isArray(item.mediaIds),
  );
  const mediaIds =
    backgroundItem && "mediaIds" in backgroundItem
      ? backgroundItem.mediaIds
      : undefined;
  const schedule =
    backgroundItem && "schedule" in backgroundItem
      ? backgroundItem.schedule
      : undefined;
  expect(mediaIds).toEqual([
    "neon-lights.jpg",
    "ramen-shop.jpg",
    "station-intro.mp4",
    "tokyo-skyline.jpg",
  ]);
  expect(schedule).toEqual([
    {
      end: 30,
      id: "seg-v12-neon",
      lockedDuration: false,
      mediaId: "neon-lights.jpg",
      start: 0,
    },
    {
      end: 0,
      id: "seg-v12-ramen",
      lockedDuration: false,
      mediaId: "ramen-shop.jpg",
      start: 0,
    },
    {
      end: 52,
      id: "seg-v12-station",
      lockedDuration: true,
      mediaId: "station-intro.mp4",
      start: 40,
    },
    {
      end: 942,
      id: "seg-v12-tokyo",
      lockedDuration: false,
      mediaId: "tokyo-skyline.jpg",
      start: 52,
    },
  ]);
}

function renderHistoryRow() {
  return {
    artifacts: [],
    capabilities: { reveal_in_explorer_supported: false },
    completed_at: "2026-06-05T00:00:12.000Z",
    created_at: "2026-06-05T00:00:00.000Z",
    duration_s: 942,
    events: [
      { detail_json: '{"current_frame":28260}', stage: "done", state: "done" },
    ],
    file_size: 5_200_000,
    finished_at: "2026-06-05T00:00:12.000Z",
    id: RENDER_ID,
    message: "Render complete",
    output_exists: true,
    output_path: "E:/video-projects/v12-flow/renders/v12-final.mp4",
    preset: "final",
    render_id: RENDER_ID,
    resolution: "1920x1080",
    started_at: "2026-06-05T00:00:00.000Z",
    status: "done",
  };
}

function buildMediaSvg(label: string): string {
  const text = escapeXml(path.basename(label).slice(0, 28));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">',
    '<rect width="320" height="180" fill="#203040"/>',
    '<rect x="18" y="18" width="284" height="144" rx="10" fill="#386641"/>',
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

function isLocator(target: Page | Locator): target is Locator {
  return (
    typeof (target as Locator).screenshot === "function" &&
    typeof (target as Page).goto !== "function"
  );
}

function mediaAsset(
  id: string,
  kind: "image" | "video",
  duration: number | null = null,
) {
  return {
    created_at: "2026-06-05T00:00:00.000Z",
    dimensions: { height: 1080, width: 1920 },
    duration,
    hash: `hash-${id}`,
    id,
    import_mode: "copy",
    imported_at: "2026-06-05T00:00:00.000Z",
    kind,
    name: id,
    path: `media/${id}`,
    role: "background",
    size: kind === "video" ? 4_800_000 : 800_000,
    thumb_path: `uploads/thumb/${id}.svg`,
  };
}

const INTEGRATED_ALIGNMENT = {
  cache_hit: true,
  sentences: [
    {
      confidence_avg: 0.98,
      end_s: 30,
      index: 1,
      start_s: 0,
      text: "Opening manual background range.",
    },
    {
      confidence_avg: 0.97,
      end_s: 40,
      index: 2,
      start_s: 30,
      text: "This sentence becomes a deliberate visual gap.",
    },
    {
      confidence_avg: 0.96,
      end_s: 52,
      index: 3,
      start_s: 40,
      text: "A locked video background starts after the gap.",
    },
    {
      confidence_avg: 0.95,
      end_s: 942,
      index: 4,
      start_s: 52,
      text: "The long final range proves whole second transport duration.",
    },
  ],
  words: [],
};

const INTEGRATED_PROJECT = {
  audio: "voice.wav",
  layers: [
    {
      id: "subtitles",
      items: [
        {
          auto: true,
          id: "sub-auto",
          label: "Auto subtitles",
          style: "default",
        },
      ],
      kind: "sub",
      name: "Subtitles",
    },
    {
      id: "bg-main",
      items: [
        {
          crossfade: 0,
          end: 942,
          id: "bg-scheduled",
          mediaIds: [
            "neon-lights.jpg",
            "ramen-shop.jpg",
            "station-intro.mp4",
            "tokyo-skyline.jpg",
          ],
          motion: { easing: "linear", kind: "none" },
          schedule: [
            {
              end: 30,
              id: "seg-v12-neon",
              lockedDuration: false,
              mediaId: "neon-lights.jpg",
              start: 0,
            },
            {
              end: 40,
              id: "seg-v12-ramen",
              lockedDuration: false,
              mediaId: "ramen-shop.jpg",
              start: 30,
            },
            {
              end: 52,
              id: "seg-v12-station",
              lockedDuration: true,
              mediaId: "station-intro.mp4",
              start: 40,
            },
            {
              end: 942,
              id: "seg-v12-tokyo",
              lockedDuration: false,
              mediaId: "tokyo-skyline.jpg",
              start: 52,
            },
          ],
          sentences: [1, 4] as [number, number],
          start: 0,
          transitions: { in: "cut", out: "cut" },
        },
      ],
      kind: "bg",
      name: "Background",
    },
  ],
  media: [
    mediaAsset("neon-lights.jpg", "image"),
    mediaAsset("ramen-shop.jpg", "image"),
    mediaAsset("station-intro.mp4", "video", 12),
    mediaAsset("tokyo-skyline.jpg", "image"),
  ],
  name: "v1.2 Integrated Flow",
  output: {
    fps: 30,
    height: 1080,
    preset: "draft",
    resolution: "1080p",
    width: 1920,
  },
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
  transcript: {
    kind: "plain_text",
    path: "transcript.txt",
    sentences: INTEGRATED_ALIGNMENT.sentences,
  },
  version: 1,
  watermark: null,
};
