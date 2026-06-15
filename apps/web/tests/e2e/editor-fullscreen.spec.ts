import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preparePage } from "./e2e-utils";

const PROJECT_ID = "p_v13_fullscreen";
const PROJECT_PATH = "E:/video-projects/v13-fullscreen";
const EVIDENCE_DIR = path.resolve(process.cwd(), "..", "..", "docs", "designs", "tasks", "v1.3", "evidences", "task-03");
const VIEWPORTS = [
  { name: "1920x1080", viewport: { width: 1920, height: 1080 } },
  { name: "1280x720", viewport: { width: 1280, height: 720 } },
  { name: "1080x1920", viewport: { width: 1080, height: 1920 } },
] as const;

type FullscreenCall = {
  action: "exit" | "request";
  testid: string | null;
};

test.describe("editor fullscreen preview flow", () => {
  test("targets the preview stage across editor resolutions and viewports", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/server/") && response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await preparePage(page, "dark");
    await installMockWebSocket(page);
    await installFullscreenProbe(page);
    await mockEditorApi(page);

    let observedFullscreenCalls: FullscreenCall[] = [];
    for (const target of VIEWPORTS) {
      await page.setViewportSize(target.viewport);
      await page.goto(`/editor/${PROJECT_ID}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "v1.3 Fullscreen Flow" })).toBeVisible();
      await setPlaybackTime(page, 38.399);

      await exerciseResolution(page, "1080p", target.name === "1920x1080");
      await exerciseResolution(page, "720p");
      await exerciseResolution(page, "9:16");
      if (target.name === "1920x1080") {
        observedFullscreenCalls = await fullscreenCalls(page);
      }
      await captureEvidence(page.getByTestId("preview-stack"), `editor-fullscreen-${target.name}.png`);
    }

    expect(observedFullscreenCalls).toEqual([
      { action: "request", testid: "preview-stage" },
      { action: "exit", testid: "preview-stage" },
    ]);
    expect([...consoleErrors, ...failedResponses]).toEqual([]);

    await writeFile(
      path.join(EVIDENCE_DIR, "browser-note.md"),
      [
        "# task-03 browser note",
        "",
        "- Browser: Playwright Chromium via `rtk pnpm -F @vc/web test:e2e -- editor-fullscreen`.",
        "- Route: `/editor/p_v13_fullscreen`.",
        "- Viewports captured: `1920x1080`, `1280x720`, `1080x1920`.",
        "- Resolutions exercised in-browser: `1080p`, `720p`, `9:16`.",
        "- Fullscreen API instrumentation recorded `requestFullscreen` and `exitFullscreen` against `data-testid=\"preview-stage\"`.",
        "- Console errors and failed `/api/server/` responses: none.",
        "",
      ].join("\n"),
      "utf-8",
    );
  });
});

async function exerciseResolution(page: Page, resolution: "1080p" | "720p" | "9:16", toggleFullscreen = false): Promise<void> {
  await page.getByRole("radio", { name: resolution }).click();
  const fullscreenButton = page.getByRole("button", { name: "Fullscreen preview" });
  await expect(fullscreenButton).toBeVisible();
  await expect(fullscreenButton).toHaveAttribute("title", "Fullscreen preview");

  const timecode = fullscreenButton.locator("xpath=following-sibling::div[1]");
  await expect(timecode).toContainText("00:38");
  await expect(timecode).toContainText("15:42");
  await expect
    .poll(
      async () => timecode.evaluate((node) => node.previousElementSibling?.getAttribute("title") ?? ""),
      { message: "Expected fullscreen button immediately before timecode" },
    )
    .toBe("Fullscreen preview");

  const [buttonBox, timecodeBox] = await Promise.all([fullscreenButton.boundingBox(), timecode.boundingBox()]);
  expect(buttonBox).not.toBeNull();
  expect(timecodeBox).not.toBeNull();
  if (!buttonBox || !timecodeBox) return;
  expect(Math.round(buttonBox.width)).toBe(32);
  expect(Math.round(buttonBox.height)).toBe(32);

  const gap = timecodeBox.x - (buttonBox.x + buttonBox.width);
  expect(gap).toBeGreaterThanOrEqual(6);
  expect(gap).toBeLessThanOrEqual(12);
  const verticalOffset = Math.abs((buttonBox.y + buttonBox.height / 2) - (timecodeBox.y + timecodeBox.height / 2));
  expect(verticalOffset).toBeLessThanOrEqual(2);

  if (toggleFullscreen) {
    await fullscreenButton.click();
    await expect.poll(async () => fullscreenCalls(page)).toHaveLength(1);
    await fullscreenButton.click();
    await expect.poll(async () => fullscreenCalls(page)).toHaveLength(2);
  }
}

async function setPlaybackTime(page: Page, targetTime: number): Promise<void> {
  await page.evaluate((time) => {
    const audio = document.querySelector("[data-testid='editor-audio']") as HTMLAudioElement | null;
    if (!audio) return;
    try {
      audio.currentTime = time;
      audio.dispatchEvent(new Event("timeupdate"));
    } catch {
      // Audio metadata is mocked in E2E; a failed seek should not hide the UI assertion.
    }
  }, targetTime);
}

async function captureEvidence(target: Locator, filename: string): Promise<void> {
  await target.waitFor({ state: "visible" });
  await target.screenshot({ path: path.join(EVIDENCE_DIR, filename) });
}

async function fullscreenCalls(page: Page): Promise<FullscreenCall[]> {
  return page.evaluate(() => {
    type CallsWindow = Window & { __vcFullscreenCalls?: FullscreenCall[] };
    return (window as CallsWindow).__vcFullscreenCalls ?? [];
  });
}

async function installFullscreenProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type CallsWindow = Window & { __vcFullscreenCalls?: FullscreenCall[] };
    const callsWindow = window as CallsWindow;
    callsWindow.__vcFullscreenCalls = [];
    let fullscreenElement: Element | null = null;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get() {
        return fullscreenElement;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value(this: HTMLElement) {
        fullscreenElement = this;
        callsWindow.__vcFullscreenCalls?.push({ action: "request", testid: this.getAttribute("data-testid") });
        return Promise.resolve();
      },
    });

    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value() {
        callsWindow.__vcFullscreenCalls?.push({
          action: "exit",
          testid: fullscreenElement?.getAttribute("data-testid") ?? null,
        });
        fullscreenElement = null;
        return Promise.resolve();
      },
    });
  });
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

async function mockEditorApi(page: Page): Promise<void> {
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
      await route.fulfill({ json: ALIGNMENT });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/config` && method === "GET") {
      await route.fulfill({
        json: {
          config: PROJECT,
          config_hash: "h-v13-fullscreen",
          has_unrendered_changes: true,
          last_rendered_config_hash: "h-rendered-before-v13",
          project_id: PROJECT_ID,
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/config` && method === "PUT") {
      await route.fulfill({
        json: {
          config_hash: "h-v13-fullscreen-save",
          has_unrendered_changes: true,
          project_id: PROJECT_ID,
          saved_at: "2026-06-15T00:00:00.000Z",
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${PROJECT_ID}/render-cache` && method === "GET") {
      await route.fulfill({ json: { cached_count: 1, project_id: PROJECT_ID, state: "warm", total_count: 1 } });
      return;
    }
    if (
      pathname === "/api/server/projects/media-file" ||
      pathname === "/api/server/projects/thumb" ||
      pathname === "/api/server/uploads/thumb"
    ) {
      const filename = url.searchParams.get("filename") ?? "media";
      await route.fulfill({ body: buildMediaSvg(filename), contentType: "image/svg+xml" });
      return;
    }
    if (pathname === "/api/server/uploads/media-file") {
      await route.fulfill({ body: buildMediaSvg("uploaded-media"), contentType: "image/svg+xml" });
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
}

function buildMediaSvg(label: string): string {
  const text = escapeXml(path.basename(label).slice(0, 32));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">',
    '<rect width="320" height="180" fill="#140f12"/>',
    '<rect width="320" height="180" fill="#7a355f"/>',
    `<text x="160" y="94" text-anchor="middle" fill="#fff7ed" font-family="Arial" font-size="18">${text}</text>`,
    "</svg>",
  ].join("");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mediaAsset(id: string) {
  return {
    created_at: "2026-06-15T00:00:00.000Z",
    dimensions: { height: 1080, width: 1920 },
    duration: null,
    hash: `hash-${id}`,
    id,
    import_mode: "copy",
    imported_at: "2026-06-15T00:00:00.000Z",
    kind: "image",
    name: id,
    path: `media/${id}`,
    role: "background",
    size: 800000,
    thumb_path: `uploads/thumb/${id}.svg`,
  };
}

const ALIGNMENT = {
  cache_hit: true,
  sentences: [
    {
      confidence_avg: 0.98,
      end_s: 942,
      index: 1,
      start_s: 0,
      text: "The editor preview owns this fullscreen surface.",
    },
  ],
  words: [],
};

const PROJECT = {
  audio: "voice.wav",
  layers: [
    {
      id: "subtitles",
      items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }],
      kind: "sub",
      name: "Subtitles",
    },
    {
      id: "bg-main",
      items: [
        {
          cache_status: "warm",
          end: 942,
          id: "bg-fullscreen",
          mediaId: "fullscreen-bg.svg",
          motion: { easing: "linear", kind: "none" },
          sentences: [1, 1] as [number, number],
          start: 0,
          transitions: { in: "cut", out: "cut" },
        },
      ],
      kind: "bg",
      name: "Background",
    },
  ],
  media: [mediaAsset("fullscreen-bg.svg")],
  name: "v1.3 Fullscreen Flow",
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
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: ALIGNMENT.sentences },
  version: 1,
  watermark: null,
};
