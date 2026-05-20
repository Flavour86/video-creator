import { Buffer } from "node:buffer";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  DEFAULT_SSIM_THRESHOLD,
  compareScreenshots,
  cropActualToReference,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";

const EDITOR_VIEWPORT = { width: 1679, height: 1194 };
const EDITOR_DEVICE_SCALE_FACTOR = 1.5;
const TEST_PROJECT_ID = "p_test01";
const DEFAULT_SCENE_SEEK_SECONDS = 38.399;

type Theme = "dark" | "light";
type CaptureTarget = "page" | "preview" | "timeline" | "inspector" | "transcript" | "dialog";

type EditorVisualCase = {
  capture: CaptureTarget;
  name: string;
  reference: string;
  run: (page: Page) => Promise<void>;
  theme: Theme;
};

const EDITOR_VISUAL_CASES: EditorVisualCase[] = [
  { name: "default editor dark", reference: "editor-dark.png", theme: "dark", capture: "page", run: async () => {} },
  { name: "default editor light", reference: "editor-light.png", theme: "light", capture: "page", run: async () => {} },
  {
    name: "draft render strip dark",
    reference: "editor-draft-render-strip-dark.png",
    theme: "dark",
    capture: "page",
    run: async (page) => {
      await mockDraftRenderSocket(page);
      await page.getByRole("button", { name: /render draft/i }).click();
      await page.getByText("Rendering draft : queued").waitFor();
    },
  },
  {
    name: "draft render strip light",
    reference: "editor-draft-render-strip-light.png",
    theme: "light",
    capture: "page",
    run: async (page) => {
      await mockDraftRenderSocket(page);
      await page.getByRole("button", { name: /render draft/i }).click();
      await page.getByText("Rendering draft : queued").waitFor();
    },
  },
  {
    name: "transcript selection range",
    reference: "editor-transcript-1.png",
    theme: "dark",
    capture: "transcript",
    run: async (page) => {
      const ninth = page.getByRole("button", { name: /A folder on your disk is the project/i }).first();
      const thirteenth = page.getByRole("button", { name: /On a Blackwell GPU it finishes/i }).first();
      await ninth.click();
      await thirteenth.click({ modifiers: ["Shift"] });
    },
  },
  {
    name: "transcript context menu",
    reference: "editor-transcript-2.png",
    theme: "dark",
    capture: "transcript",
    run: async (page) => {
      const sentence = page.getByRole("button", { name: /Open the folder elsewhere/i }).first();
      await sentence.click({ button: "right" });
      await page.getByRole("menuitem", { name: /assign media to range/i }).waitFor();
    },
  },
  {
    name: "transcript merge action",
    reference: "editor-transcript-3.png",
    theme: "dark",
    capture: "transcript",
    run: async (page) => {
      const ninth = page.getByRole("button", { name: /A folder on your disk is the project/i }).first();
      const eleventh = page.getByRole("button", { name: /The editor itself is a single browser tab/i }).first();
      const tenth = page.getByRole("button", { name: /Open the folder elsewhere/i }).first();
      await ninth.click();
      await eleventh.click({ modifiers: ["Shift"] });
      await tenth.click({ button: "right" });
      await page.getByRole("menuitem", { name: /merge 3 sentences/i }).waitFor();
    },
  },
  {
    name: "preview dark",
    reference: "editor-preview-dark.png",
    theme: "dark",
    capture: "preview",
    run: async () => {},
  },
  {
    name: "preview light",
    reference: "editor-preview-light.png",
    theme: "light",
    capture: "preview",
    run: async () => {},
  },
  {
    name: "preview 9:16",
    reference: "editor-preview-1.png",
    theme: "dark",
    capture: "preview",
    run: async (page) => {
      await page.getByRole("radio", { name: "9:16" }).click();
    },
  },
  {
    name: "preview layers popover",
    reference: "editor-preview-popover.png",
    theme: "dark",
    capture: "preview",
    run: async (page) => {
      await page.getByRole("button", { name: /Layers -/i }).click();
      await page.getByText(/Layer order - top renders on top/i).waitFor();
    },
  },
  {
    name: "timeline dark",
    reference: "editor-timeline-dark.png",
    theme: "dark",
    capture: "timeline",
    run: async () => {},
  },
  {
    name: "timeline light",
    reference: "editor-timeline-light.png",
    theme: "light",
    capture: "timeline",
    run: async () => {},
  },
  {
    name: "inspector dark",
    reference: "editor-inspector-dark.png",
    theme: "dark",
    capture: "inspector",
    run: async (page) => {
      await page.getByRole("button", { name: "quote-card.png over s9-s11" }).first().click();
      await page.getByRole("heading", { name: "PiP · z4" }).waitFor();
    },
  },
  {
    name: "inspector light",
    reference: "editor-inspector-light.png",
    theme: "light",
    capture: "inspector",
    run: async (page) => {
      await page.getByRole("button", { name: "callout-map.png over s6-s10" }).first().click();
      await page.getByRole("heading", { name: "PiP · z3" }).waitFor();
    },
  },
  {
    name: "inspector background",
    reference: "editor-inspector-1.png",
    theme: "dark",
    capture: "inspector",
    run: async () => {},
  },
  {
    name: "inspector foreground",
    reference: "editor-inspector-2.png",
    theme: "dark",
    capture: "inspector",
    run: async (page) => {
      await page.getByRole("button", { name: "quote-card.png over s10-s11" }).first().click();
      await page.getByRole("heading", { name: "Foreground · z1" }).waitFor();
    },
  },
  {
    name: "assign modal dark",
    reference: "AssignModal.png",
    theme: "dark",
    capture: "dialog",
    run: async (page) => {
      await openAssignModal(page);
    },
  },
  {
    name: "assign modal light",
    reference: "AssignModal-light.png",
    theme: "light",
    capture: "dialog",
    run: async (page) => {
      await openAssignModal(page);
    },
  },
  {
    name: "assign modal light scrolled",
    reference: "AssignModal-light-1.png",
    theme: "light",
    capture: "dialog",
    run: async (page) => {
      await openAssignModal(page);
      const dialog = page.getByRole("dialog").first();
      await dialog.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
    },
  },
  {
    name: "background modal light",
    reference: "change-background-light.png",
    theme: "light",
    capture: "dialog",
    run: async (page) => {
      await page.getByRole("button", { name: /Change Background/i }).click();
      await page.getByRole("heading", { name: /Change background/i }).waitFor();
    },
  },
  {
    name: "subtitles modal dark",
    reference: "SubtitleModal.png",
    theme: "dark",
    capture: "dialog",
    run: async (page) => {
      await page.getByRole("button", { name: /^Subtitles$/i }).click();
      await page.getByRole("heading", { name: /^Subtitles$/i }).waitFor();
    },
  },
];

test.describe("editor visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: EDITOR_DEVICE_SCALE_FACTOR, viewport: EDITOR_VIEWPORT });

  for (const visualCase of EDITOR_VISUAL_CASES) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareEditorVisualCase(page, visualCase);
    });
  }
});

async function compareEditorVisualCase(page: Page, visualCase: EditorVisualCase): Promise<void> {
  await prepareVisualPage(page, visualCase.theme);
  await routeEditorApi(page);
  await page.goto(`/editor/${TEST_PROJECT_ID}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
  await settleChrome(page);
  await setReferencePlayback(page);

  await visualCase.run(page);
  await page.waitForTimeout(100);
  const referencePath = await visualReferencePath(visualCase.reference);
  const actualPath = await visualActualPath(visualCase.reference.replace(".png", ".actual.png"));
  const captureTarget = screenshotForCapture(page, visualCase.capture);
  if (isLocator(captureTarget)) {
    await captureTarget.waitFor({ state: "visible" });
  }
  await captureTarget.screenshot({ path: actualPath });
  await cropActualToReference(actualPath, referencePath);
  await compareScreenshots({
    actualPath,
    referencePath,
    stateName: visualCase.name,
    threshold: DEFAULT_SSIM_THRESHOLD,
  });
}

async function prepareVisualPage(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ projectId, themeValue }) => {
      window.localStorage.setItem("vc.theme", themeValue);
      window.localStorage.setItem("vc.language", "en");
      window.localStorage.setItem(`vc.editor.operations.${projectId}`, JSON.stringify({ redo: [], undo: [], version: 1 }));
      window.localStorage.setItem(
        `vc.editor.recovery.${projectId}`,
        JSON.stringify({
          resolution: "1080p",
          selected: { itemId: "pip-001", layerId: "L-pip-1" },
          selectedRange: [6, 7],
          transcriptScrollTop: 0,
          version: 1,
        }),
      );
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}";
      document.documentElement.appendChild(style);
    },
    { projectId: TEST_PROJECT_ID, themeValue: theme },
  );
}

async function routeEditorApi(page: Page): Promise<void> {
  await page.route("**/api/server/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/inspect` && method === "POST") {
      await route.fulfill({ json: { path: "E:/projects/TokyoEssay" } });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/alignment` && method === "GET") {
      await route.fulfill({ json: TEST_ALIGNMENT });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/config` && method === "GET") {
      await route.fulfill({
        json: {
          config: TEST_PROJECT,
          config_hash: "h-visual",
          has_unrendered_changes: true,
          last_rendered_config_hash: null,
          project_id: TEST_PROJECT_ID,
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/config` && method === "PUT") {
      await route.fulfill({
        json: {
          config_hash: "h-visual-next",
          has_unrendered_changes: true,
          project_id: TEST_PROJECT_ID,
          saved_at: "2026-05-19T00:00:00.000Z",
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/render` && method === "POST") {
      await route.fulfill({ json: { output_path: "renders/r-visual.mp4", render_id: "r-visual" } });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/renders/r-visual/cancel` && method === "POST") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (pathname === "/api/server/uploads/thumb") {
      const filename = url.searchParams.get("filename") || "";
      await route.fulfill({
        body: buildMediaSvg(filename),
        contentType: "image/svg+xml",
      });
      return;
    }
    if (pathname === "/api/server/projects/media-file") {
      const filename = url.searchParams.get("filename") || "";
      await route.fulfill({
        body: buildMediaSvg(filename),
        contentType: "image/svg+xml",
      });
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

async function settleChrome(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
  await page.waitForTimeout(200);
}

function screenshotForCapture(page: Page, capture: CaptureTarget): Page | Locator {
  const layoutGrid = page.getByTestId("editor-layout-grid");
  if (capture === "preview") {
    return page.getByTestId("preview-stack");
  }
  if (capture === "timeline") {
    return page.getByTestId("timeline-waveform").locator("xpath=ancestor::section[1]");
  }
  if (capture === "inspector") {
    return layoutGrid.locator("aside").nth(1);
  }
  if (capture === "transcript") {
    return page.getByTestId("transcript-list");
  }
  if (capture === "dialog") {
    return page;
  }
  return page;
}

function isLocator(target: Page | Locator): target is Locator {
  return typeof (target as Locator).waitFor === "function";
}

async function openAssignModal(page: Page): Promise<void> {
  const sentence = page.getByRole("button", { name: /You record voice, you write transcript/i }).first();
  await sentence.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Assign media to range/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function mockDraftRenderSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    class MockWebSocket {
      onclose: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      readyState = 1;
      url: string;

      constructor(url: string | URL) {
        this.url = String(url);
        queueMicrotask(() => {
          if (typeof this.onopen === "function") {
            this.onopen(new Event("open"));
          }
        });
      }

      close() {
        this.readyState = 3;
        if (typeof this.onclose === "function") {
          this.onclose(new Event("close"));
        }
      }

      send() {}
    }

    window.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });
}

const TEST_ALIGNMENT = {
  cache_hit: true,
  sentences: [
    { confidence_avg: 0.96, end_s: 5, index: 1, start_s: 0, text: "Most editing tools fight you when you have a clear script in your head." },
    { confidence_avg: 0.95, end_s: 12, index: 2, start_s: 6, text: "You record voice, you write transcript, you collect images, then everything has to be lined up by hand." },
    { confidence_avg: 0.95, end_s: 19, index: 3, start_s: 13, text: "This tool flips that order." },
    { confidence_avg: 0.95, end_s: 25, index: 4, start_s: 19, text: "It treats the transcript as the source of truth and the voice as the timing layer." },
    { confidence_avg: 0.95, end_s: 30, index: 5, start_s: 26, text: "Forced alignment turns sentences into time ranges." },
    { confidence_avg: 0.95, end_s: 37, index: 6, start_s: 32, text: "Drop an image onto a sentence and the editor knows when it should appear." },
    { confidence_avg: 0.95, end_s: 44, index: 7, start_s: 38, text: "Re-record the voice and your assignments survive — only the resolved timestamps shift." },
    { confidence_avg: 0.95, end_s: 51, index: 8, start_s: 45, text: "Phase one is local-only. No cloud, no AI generation, no surprise bills." },
    { confidence_avg: 0.95, end_s: 56, index: 9, start_s: 51, text: "A folder on your disk is the project. Voice, transcript, media, renders, cache." },
    { confidence_avg: 0.95, end_s: 63, index: 10, start_s: 57, text: "Open the folder elsewhere — same project. Zip it and share — works." },
    { confidence_avg: 0.95, end_s: 70, index: 11, start_s: 64, text: "The editor itself is a single browser tab over a Python sidecar." },
    { confidence_avg: 0.95, end_s: 77, index: 12, start_s: 71, text: "WhisperX runs alignment with the transcript as reference text, never re-transcribing." },
    { confidence_avg: 0.95, end_s: 81, index: 13, start_s: 77, text: "On a Blackwell GPU it finishes a fifteen-minute audio in under a minute." },
    { confidence_avg: 0.95, end_s: 88, index: 14, start_s: 83, text: "On a CPU it takes a few minutes, still inside the work loop." },
    { confidence_avg: 0.95, end_s: 95, index: 15, start_s: 90, text: "ffmpeg does the composition with one filtergraph per render." },
    { confidence_avg: 0.95, end_s: 102, index: 16, start_s: 96, text: "Cached clips per foreground item make iteration cheap." },
    { confidence_avg: 0.95, end_s: 107, index: 17, start_s: 102, text: "Move an item in time and the cache stays warm — only recomposition runs." },
    { confidence_avg: 0.95, end_s: 114, index: 18, start_s: 109, text: "Two render presets ship out of the gate: draft at 720p and final at 1080p." },
    { confidence_avg: 0.95, end_s: 121, index: 19, start_s: 115, text: "Final lands inside YouTube's transcoder cleanly with no warnings." },
    { confidence_avg: 0.95, end_s: 128, index: 20, start_s: 122, text: "Phase two adds AI generation routed entirely to serverless GPUs." },
    { confidence_avg: 0.95, end_s: 942, index: 21, start_s: 936, text: "Phase three productizes once the workflow earns its keep." },
  ],
  words: [],
};

const TEST_PROJECT = {
  audio: "voice.mp3",
  layers: [
    { id: "L-sub", items: [{ auto: true, id: "sub-all", label: "auto from transcript · 21 cues", style: "default" }], kind: "sub", name: "Subtitles" },
    {
      id: "L-pip-2",
      items: [
        {
          cache_status: "warm",
          end: 70,
          id: "pip-002",
          mediaId: "quote-card.png",
          motion: { easing: "linear", kind: "none" },
          pip: { opacity: 90, posX: 68, posY: 66, radius: 16, size: 22 },
          sentences: [9, 11] as [number, number],
          start: 51,
          transitions: { in: "fade", out: "fade" },
        },
        {
          cache_status: "warm",
          end: 96.5,
          id: "pip-003",
          mediaId: "crowd-cross.jpg",
          motion: { easing: "linear", kind: "none" },
          pip: { opacity: 90, posX: 68, posY: 66, radius: 16, size: 22 },
          sentences: [14, 15] as [number, number],
          start: 88,
          transitions: { in: "fade", out: "fade" },
        },
      ],
      kind: "pip",
      name: "PiP · z4",
    },
    {
      id: "L-pip-1",
      items: [
        {
          cache_status: "warm",
          end: 63,
          id: "pip-001",
          mediaId: "callout-map.png",
          motion: { easing: "linear", kind: "none" },
          pip: { opacity: 100, posX: 68, posY: 66, radius: 12, size: 30 },
          sentences: [6, 10] as [number, number],
          start: 32,
          transitions: { in: "fade", out: "fade" },
        },
      ],
      kind: "pip",
      name: "PiP · z3",
    },
    {
      id: "L-fg-1",
      items: [
        {
          cache_status: "warm",
          end: 25.1,
          id: "fg-001",
          mediaId: "station-intro.mp4",
          motion: { easing: "ease_in_out", kind: "none" },
          sentences: [3, 4] as [number, number],
          start: 13.8,
          transitions: { in: "fade", out: "cut" },
        },
        {
          cache_status: "warm",
          end: 47.2,
          id: "fg-002",
          mediaId: "tokyo-skyline.jpg",
          motion: { easing: "ease_in_out", kind: "ken_burns" },
          sentences: [6, 7] as [number, number],
          start: 33.5,
          transitions: { in: "fade", out: "cut" },
        },
        {
          cache_status: "warm",
          end: 73.1,
          id: "fg-004",
          mediaId: "quote-card.png",
          motion: { easing: "ease_out", kind: "zoom_in" },
          sentences: [10, 11] as [number, number],
          start: 60.5,
          transitions: { in: "fade", out: "fade" },
        },
      ],
      kind: "fg",
      name: "Foreground · z1",
    },
    {
      id: "L-bg",
      items: [
        {
          cache_status: "warm",
          crossfade: 0.6,
          end: 942,
          id: "bg-001",
          mediaId: "neon-lights.jpg",
          mediaIds: ["neon-lights.jpg", "ramen-shop.jpg", "crowd-cross.jpg"],
          motion: { easing: "linear", kind: "ken_burns" },
          sentences: [1, 21] as [number, number],
          start: 0,
          transitions: { in: "cut", out: "cut" },
        },
      ],
      kind: "bg",
      name: "Background",
    },
  ],
  media: [
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 2268, width: 4032 },
      duration: null,
      hash: "hash-m1",
      id: "tokyo-skyline.jpg",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "tokyo-skyline.jpg",
      path: "media/tokyo-skyline.jpg",
      size: 3400000,
      thumb_path: "uploads/thumb/tokyo-skyline.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 1080, width: 1920 },
      duration: 12,
      hash: "hash-m2",
      id: "station-intro.mp4",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "video",
      name: "station-intro.mp4",
      path: "media/station-intro.mp4",
      size: 18600000,
      thumb_path: "uploads/thumb/station-intro.mp4",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 1080, width: 1920 },
      duration: null,
      hash: "hash-m3",
      id: "callout-map.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "callout-map.png",
      path: "media/callout-map.png",
      size: 900000,
      thumb_path: "uploads/thumb/callout-map.png",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 1080, width: 1920 },
      duration: null,
      hash: "hash-m4",
      id: "quote-card.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "quote-card.png",
      path: "media/quote-card.png",
      size: 600000,
      thumb_path: "uploads/thumb/quote-card.png",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 3648, width: 5472 },
      duration: null,
      hash: "hash-m5",
      id: "crowd-cross.jpg",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "crowd-cross.jpg",
      path: "media/crowd-cross.jpg",
      size: 5100000,
      thumb_path: "uploads/thumb/crowd-cross.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 2688, width: 4032 },
      duration: null,
      hash: "hash-m6",
      id: "neon-lights.jpg",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "neon-lights.jpg",
      path: "media/neon-lights.jpg",
      size: 4200000,
      thumb_path: "uploads/thumb/neon-lights.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 1080, width: 1920 },
      duration: 8,
      hash: "hash-m7",
      id: "yamanote-line.mp4",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "video",
      name: "yamanote-line.mp4",
      path: "media/yamanote-line.mp4",
      size: 12800000,
      thumb_path: "uploads/thumb/yamanote-line.mp4",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 2268, width: 4032 },
      duration: null,
      hash: "hash-m8",
      id: "ramen-shop.jpg",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "ramen-shop.jpg",
      path: "media/ramen-shop.jpg",
      size: 3900000,
      thumb_path: "uploads/thumb/ramen-shop.jpg",
    },
  ],
  name: "TokyoEssay",
  output: { preset: "final", resolution: "1080p" },
  subtitles: {
    burn_in: true,
    style: {
      bg_style: "shadow",
      font: "Inter",
      max_chars_per_line: 42,
      position: "bottom",
      size: 42,
    },
  },
  transcript: { kind: "plain_text", path: "transcript.txt" },
  version: 1,
  watermark: {
    mediaId: "callout-map.png",
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  },
};

async function setReferencePlayback(page: Page): Promise<void> {
  await page.evaluate((targetTime) => {
    const audio = document.querySelector("[data-testid='editor-audio']") as HTMLAudioElement | null;
    if (!audio) return;
    try {
      audio.currentTime = targetTime;
      audio.dispatchEvent(new Event("timeupdate"));
    } catch {
      // Ignore audio seek errors in test mode.
    }
  }, DEFAULT_SCENE_SEEK_SECONDS);
}

function buildMediaSvg(filename: string): Buffer {
  const safe = filename.toLowerCase();
  const [start, end] = gradientForMedia(safe);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${start}" />
      <stop offset="100%" stop-color="${end}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1920" height="1080" fill="url(#g)" />
  <rect x="0" y="0" width="1920" height="1080" fill="rgba(0,0,0,0.05)" />
</svg>`;
  return Buffer.from(svg);
}

function gradientForMedia(filename: string): [string, string] {
  if (filename.includes("callout-map")) return ["#0f4f6f", "#126487"];
  if (filename.includes("quote-card")) return ["#6a5032", "#826239"];
  if (filename.includes("crowd-cross")) return ["#5a2b2b", "#7a3f35"];
  if (filename.includes("neon-lights")) return ["#6b2a58", "#8f3f4a"];
  if (filename.includes("yamanote-line")) return ["#2f6a56", "#3a7a72"];
  if (filename.includes("ramen-shop")) return ["#7f3a1f", "#9e5b35"];
  if (filename.includes("station-intro")) return ["#695f5b", "#9a7f64"];
  return ["#454275", "#855037"];
}
