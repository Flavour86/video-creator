import { expect, test, type Page } from "@playwright/test";

import {
  compareScreenshots,
  cropActualToReference,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";
import {
  RENDER_PAGE_SSIM_THRESHOLD,
  RENDER_STATE_CASES,
  RENDER_VISUAL_CASES,
  type RenderVisualCase,
  type RenderVisualState,
  type RenderVisualTheme as Theme,
} from "./render-visual-cases";

const RENDER_VIEWPORT = { width: 1679, height: 1192 };
const RENDER_DEVICE_SCALE_FACTOR = 1.5;
const TEST_PROJECT_ID = "p_visual";
const PROJECT_NAME = "Tokyo Essay";
const STARTED_AT = "2026-05-22T08:24:00.000Z";
const FINISHED_AT = "2026-05-22T08:29:01.000Z";
let activeVisualState: RenderVisualState = "composing";

type RenderHistoryRow = {
  artifacts?: Array<{ kind: string; path: string; size?: number | null }>;
  capabilities?: { reveal_in_explorer_supported: boolean };
  completed_at?: string | null;
  duration?: number | null;
  duration_s: number | null;
  events?: Array<{
    event_id?: string;
    message?: string | null;
    percent?: number | null;
    render_id?: string;
    stage?: string;
  }>;
  file_size: number | null;
  finished_at: string | null;
  id: string;
  message: string | null;
  output_exists?: boolean;
  output_path: string;
  preset: "final" | "draft";
  render_id: string;
  resolution: string;
  started_at: string;
  status: string;
};

type SocketEvent = {
  current_frame?: number;
  eta_seconds?: number;
  line?: string;
  message?: string;
  output_path?: string;
  percent?: number;
  render_id: string;
  speed?: string;
  stage?: string;
  type: "log" | "progress";
};

test.describe("render visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: RENDER_DEVICE_SCALE_FACTOR, viewport: RENDER_VIEWPORT });

  for (const visualCase of RENDER_VISUAL_CASES) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareRenderVisualCase(page, visualCase);
    });
  }

  test("covers required render states without text overlap", async ({ page }) => {
    await prepareVisualPage(page, "dark");
    await routeRenderApi(page);

    for (const stateCase of RENDER_STATE_CASES) {
      await openRenderState(page, stateCase.state);
      await expect(page.getByText(stateCase.expectedText).first()).toBeVisible();
      await expectNoLeafTextOverlap(page, stateCase.name);
    }
  });

  test("keeps active render controls stable across desktop and mobile widths", async ({ page }) => {
    await prepareVisualPage(page, "dark");
    await routeRenderApi(page);

    for (const viewport of [
      { width: 1679, height: 1192 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openRenderState(page, "queued");
      const queued = await headerControlMetrics(page);

      await openRenderState(page, "composing");
      const composing = await headerControlMetrics(page);

      expect(composing, `Header controls shifted at ${viewport.width}x${viewport.height}`).toEqual(queued);
    }
  });
});

async function compareRenderVisualCase(page: Page, visualCase: RenderVisualCase): Promise<void> {
  await prepareVisualPage(page, visualCase.theme);
  await routeRenderApi(page);
  await openRenderState(page, visualCase.state);
  await assertWrittenRenderSpec(page);

  const referencePath = await visualReferencePath(visualCase.reference);
  const actualPath = await visualActualPath(visualCase.reference.replace(".png", ".actual.png"));
  await page.screenshot({ path: actualPath });
  await cropActualToReference(actualPath, referencePath);
  await compareScreenshots({
    actualPath,
    referencePath,
    blurRadius: 3,
    stateName: visualCase.name,
    threshold: RENDER_PAGE_SSIM_THRESHOLD,
  });
}

async function assertWrittenRenderSpec(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Tokyo Essay / 1080p final render" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tokyo Essay composing\.mp4/ })).toBeVisible();
  await expect(page.getByText("1920x1080").first()).toBeVisible();
  await expect(page.getByText("H.264").first()).toBeVisible();
  await expect(page.getByText("CRF 18").first()).toBeVisible();
  await expect(page.getByText("AAC 192kbps").first()).toBeVisible();

  for (const label of [
    "queued",
    "Verify alignment cache",
    "Pre-render cached clips",
    "Build subtitles.srt",
    "Compose filtergraph",
    "Mux MP4 with +faststart",
    "Append render history",
  ]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }

  for (const label of [
    "project",
    "file",
    "resolution",
    "framerate",
    "video codec",
    "CRF",
    "preset",
    "audio codec",
    "bitrate",
    "sample rate",
    "color",
    "est. size",
  ]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
}

async function prepareVisualPage(page: Page, theme: Theme): Promise<void> {
  await page.context().addInitScript(
    ({ socketEvents, themeValue }) => {
      window.localStorage.setItem("vc.theme", themeValue);
      window.localStorage.setItem("vc.language", "en");
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}";
      document.documentElement.appendChild(style);

      class MockWebSocket {
        static CLOSED = 3;
        static CLOSING = 2;
        static CONNECTING = 0;
        static OPEN = 1;
        onclose: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onopen: ((event: Event) => void) | null = null;
        readyState = 0;
        url: string;

        constructor(url: string) {
          this.url = url;
          window.setTimeout(() => {
            this.readyState = 1;
            this.onopen?.(new Event("open"));
            const renderId = new URL(url, window.location.href).searchParams.get("render_id") ?? "";
            const events = socketEvents[renderId] ?? [];
            events.forEach((event, index) => {
              window.setTimeout(() => {
                this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
              }, 20 + index * 20);
            });
          }, 10);
        }

        close() {
          this.readyState = 3;
          this.onclose?.(new Event("close"));
        }

        send() {}
      }

      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: MockWebSocket,
        writable: true,
      });
      Object.defineProperty(globalThis, "WebSocket", {
        configurable: true,
        value: MockWebSocket,
        writable: true,
      });
    },
    { socketEvents: socketEventsByRenderId(), themeValue: theme },
  );
}

async function routeRenderApi(page: Page): Promise<void> {
  let socketInstalled = false;

  await page.route("**/api/server/projects/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === `/api/server/projects/${TEST_PROJECT_ID}/config`) {
      await route.fulfill({ json: { config: { name: PROJECT_NAME } } });
      return;
    }

    if (url.pathname === `/api/server/projects/${TEST_PROJECT_ID}/history`) {
      if (!socketInstalled) {
        await installRuntimeRenderSocket(page);
        socketInstalled = true;
      }
      const state = activeVisualState;
      const renderId = renderIdForState(state);
      const active = rowForState(state, renderId);
      const rows = url.searchParams.get("limit") === "500"
        ? [active, ...historyRowsForState("done", "r_previous")]
        : historyRowsForState(state, renderId);
      await route.fulfill({ json: rows });
      return;
    }

    if (url.pathname === `/api/server/projects/${TEST_PROJECT_ID}/render` && method === "POST") {
      await route.fulfill({
        json: {
          output_path: outputPathForState("done"),
          render_id: renderIdForState("afterRenderActions"),
        },
      });
      return;
    }

    if (url.pathname.startsWith(`/api/server/projects/${TEST_PROJECT_ID}/history/`) && method === "DELETE") {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    if (/^\/api\/server\/projects\/p_visual\/render\/r[-_A-Za-z0-9]+$/.test(url.pathname)) {
      await route.fulfill({ body: "", contentType: "video/mp4" });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/server/system/reveal", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
}

async function installRuntimeRenderSocket(page: Page): Promise<void> {
  await page.evaluate(({ socketEvents }) => {
    class MockWebSocket {
      static CLOSED = 3;
      static CLOSING = 2;
      static CONNECTING = 0;
      static OPEN = 1;
      onclose: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      readyState = 0;
      url: string;

      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.readyState = 1;
          this.onopen?.(new Event("open"));
          const renderId = new URL(url, window.location.href).searchParams.get("render_id") ?? "";
          const events = socketEvents[renderId] ?? [];
          events.forEach((event, index) => {
            window.setTimeout(() => {
              this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
            }, 20 + index * 20);
          });
        }, 10);
      }

      close() {
        this.readyState = 3;
        this.onclose?.(new Event("close"));
      }

      send() {}
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
      writable: true,
    });
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
      writable: true,
    });
  }, { socketEvents: socketEventsByRenderId() });
}

async function openRenderState(page: Page, state: RenderVisualState): Promise<void> {
  activeVisualState = state;
  await page.goto(`/render/${TEST_PROJECT_ID}/${renderIdForState(state)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /^Tokyo Essay \// }).waitFor();
  await settleChrome(page);
}

async function settleChrome(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
  await page.waitForTimeout(250);
}

function historyRowsForState(state: RenderVisualState, renderId: string): RenderHistoryRow[] {
  if (state === "historyEmpty") return [];
  return [
    rowForState(state, renderId),
    rowForState("done", "r_previous"),
    rowForState("partialExcluded", "r_partial_previous"),
  ];
}

function rowForState(state: RenderVisualState, renderId: string): RenderHistoryRow {
  const effectiveState = state === "afterRenderActions" ? "done" : state;
  const outputExists = outputExistsForState(state);
  return {
    artifacts: eventsForState(state).some((event) => event.stage === "error")
      ? [{ kind: "log", path: `E:/video-projects/tokyo-essay/renders/${renderId}.log`, size: 4096 }]
      : [],
    capabilities: { reveal_in_explorer_supported: true },
    duration: terminalState(effectiveState) ? 301 : null,
    duration_s: terminalState(effectiveState) ? 301 : null,
    events: eventsForState(state).map((event, index) => ({
      event_id: `00:0${index}:12`,
      message: event.message,
      percent: event.percent ?? null,
      render_id: renderId,
      stage: event.stage,
    })),
    file_size: outputExists ? 124_780_544 : null,
    finished_at: terminalState(effectiveState) ? FINISHED_AT : null,
    id: renderId,
    message: messageForState(state),
    output_exists: outputExists,
    output_path: outputPathForState(state),
    preset: "final",
    render_id: renderId,
    resolution: "1920x1080",
    started_at: STARTED_AT,
    status: statusForState(effectiveState),
  };
}

function eventsForState(state: RenderVisualState): SocketEvent[] {
  const progress = progressEventForState(state, renderIdForState(state));
  if (progress) {
    return [
      { line: `ffmpeg ${progress.stage} ${Math.round(progress.percent ?? 0)}%`, render_id: progress.render_id, type: "log" },
      progress,
    ];
  }
  if (state === "ffmpegWarning") {
    return [{ message: "ffmpeg warning: non-monotonic DTS corrected", percent: 100, render_id: renderIdForState(state), stage: "done", type: "progress" }];
  }
  if (state === "ffmpegFatalError") {
    return [{ message: "ffmpeg fatal error: encoder exited with code 1", percent: 71, render_id: renderIdForState(state), stage: "error", type: "progress" }];
  }
  if (state === "failed") {
    return [{ message: "render failed: missing media source", percent: 44, render_id: renderIdForState(state), stage: "failed", type: "progress" }];
  }
  if (state === "cancelled") {
    return [{ message: "render cancelled by user", percent: 37, render_id: renderIdForState(state), stage: "cancelled", type: "progress" }];
  }
  return [];
}

function progressEventForState(state: RenderVisualState, renderId: string): SocketEvent | null {
  const common = { current_frame: 12640, eta_seconds: 623, output_path: outputPathForState(state), render_id: renderId, speed: "1.2x", type: "progress" as const };
  if (state === "queued") return { ...common, current_frame: 0, eta_seconds: 0, message: "queued behind 1 render", percent: 3, speed: "", stage: "queued" };
  if (state === "verifying") return { ...common, current_frame: 210, message: "Verifying alignment cache", percent: 8, stage: "verify_alignment_cache" };
  if (state === "prerender") return { ...common, current_frame: 1840, message: "Pre-rendering clips", percent: 18, stage: "pre_render_cached_clips" };
  if (state === "subtitles") return { ...common, current_frame: 2210, message: "Building subtitles.srt", percent: 28, stage: "build_subtitles_srt" };
  if (state === "composing") return { ...common, message: "Composing filtergraph", percent: 46, stage: "compose_filtergraph" };
  if (state === "muxing") return { ...common, current_frame: 23880, eta_seconds: 81, message: "Muxing MP4 with +faststart", percent: 86, speed: "1.8x", stage: "mux_mp4_faststart" };
  if (state === "loggingHistory") return { ...common, current_frame: 24820, eta_seconds: 7, message: "Appending render history", percent: 97, speed: "2.0x", stage: "append_render_history_to_app_db" };
  return null;
}

function socketEventsByRenderId(): Record<string, SocketEvent[]> {
  return Object.fromEntries(
    RENDER_STATE_CASES.map((stateCase) => [renderIdForState(stateCase.state), eventsForState(stateCase.state)]),
  );
}

function renderIdForState(state: RenderVisualState): string {
  return `r_${state.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

function statusForState(state: RenderVisualState): string {
  const statuses: Record<RenderVisualState, string> = {
    afterRenderActions: "done",
    cancelled: "cancelled",
    cancelling: "cancelling",
    composing: "composing",
    done: "done",
    failed: "failed",
    ffmpegFatalError: "ffmpeg_fatal_error",
    ffmpegWarning: "ffmpeg_warning",
    historyEmpty: "history_empty",
    idle: "idle",
    loggingHistory: "logging_history",
    muxing: "muxing",
    outputMissing: "output_missing",
    partialExcluded: "partial_excluded",
    prerender: "prerender",
    queued: "queued",
    subtitles: "subtitles",
    verifying: "verifying",
  };
  return statuses[state];
}

function outputExistsForState(state: RenderVisualState): boolean {
  return state === "done" || state === "afterRenderActions" || state === "ffmpegWarning";
}

function outputPathForState(state: RenderVisualState): string {
  const suffix = state === "afterRenderActions" ? "done" : state;
  return `E:/video-projects/tokyo-essay/renders/Tokyo Essay ${suffix}.mp4`;
}

function messageForState(state: RenderVisualState): string | null {
  if (state === "ffmpegWarning") return "ffmpeg warning: non-monotonic DTS corrected";
  if (state === "ffmpegFatalError") return "ffmpeg fatal error: encoder exited with code 1";
  if (state === "outputMissing") return "Render completed but output file is missing.";
  if (state === "partialExcluded") return "Partial output excluded after failed render.";
  return null;
}

function terminalState(state: RenderVisualState): boolean {
  return [
    "cancelled",
    "done",
    "failed",
    "ffmpegFatalError",
    "ffmpegWarning",
    "outputMissing",
    "partialExcluded",
  ].includes(state);
}

async function headerControlMetrics(page: Page): Promise<Array<{ height: number; text: string; width: number }>> {
  return page.locator("header button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      height: Math.round(rect.height),
      text: (button.textContent ?? "").replace(/\s+/g, " ").trim(),
      width: Math.round(rect.width),
    };
  }));
}

async function expectNoLeafTextOverlap(page: Page, label: string): Promise<void> {
  const overlaps = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("h1,h2,h3,p,button,strong,span")]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!text) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 3 || rect.height < 3) return false;
        const style = window.getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
        return ![...node.children].some((child) => (child.textContent ?? "").trim().length > 0);
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
          top: rect.top,
        };
      });

    const problems: string[] = [];
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const a = candidates[leftIndex];
        const b = candidates[rightIndex];
        if (!a || !b) continue;
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 1 && yOverlap > 1) {
          problems.push(`${a.text} <-> ${b.text}`);
        }
      }
    }
    return problems;
  });

  expect(overlaps, `Text overlaps in ${label}:\n${overlaps.join("\n")}`).toEqual([]);
}
