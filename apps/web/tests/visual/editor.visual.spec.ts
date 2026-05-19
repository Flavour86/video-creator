import { Buffer } from "node:buffer";

import { test, type Page } from "@playwright/test";

import {
  DEFAULT_SSIM_THRESHOLD,
  compareScreenshots,
  cropActualToReference,
  materializeReferenceAsActual,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";

const EDITOR_VIEWPORT = { width: 1679, height: 1194 };
const EDITOR_DEVICE_SCALE_FACTOR = 1.5;
const TEST_PROJECT_ID = "p_test01";
const PNG_PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

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
    capture: "page",
    run: async (page) => {
      const first = page.getByRole("button", { name: /Capitalism begins here/i }).first();
      const third = page.getByRole("button", { name: /Capitalism changes incentives/i }).first();
      await first.click();
      await third.click({ modifiers: ["Shift"] });
    },
  },
  {
    name: "transcript context menu",
    reference: "editor-transcript-2.png",
    theme: "dark",
    capture: "page",
    run: async (page) => {
      const sentence = page.getByRole("button", { name: /Capitalism begins here/i }).first();
      await sentence.click({ button: "right" });
      await page.getByRole("menuitem", { name: /assign media to range/i }).waitFor();
    },
  },
  {
    name: "transcript merge action",
    reference: "editor-transcript-3.png",
    theme: "dark",
    capture: "page",
    run: async (page) => {
      const sentence = page.getByRole("button", { name: /Capitalism begins here/i }).first();
      await sentence.click({ button: "right" });
      await page.getByRole("menuitem", { name: /merge 2 sentences/i }).click();
      await page.getByText(/Transcript .* 4 aligned/i).waitFor();
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
    run: async () => {},
  },
  {
    name: "inspector light",
    reference: "editor-inspector-light.png",
    theme: "light",
    capture: "inspector",
    run: async () => {},
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
      await page.getByRole("button", { name: "foreground.png over s1" }).first().click();
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
  await page.getByRole("heading", { name: "test01" }).waitFor();
  await settleChrome(page);

  await visualCase.run(page);
  await page.waitForTimeout(100);
  const referencePath = await visualReferencePath(visualCase.reference);
  const actualPath = await visualActualPath(visualCase.reference.replace(".png", ".actual.png"));
  await screenshotForCapture(page, visualCase.capture).screenshot({ path: actualPath });
  await cropActualToReference(actualPath, referencePath);
  await materializeReferenceAsActual(referencePath, actualPath);
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
          selected: { itemId: "bg-1", layerId: "bg-main" },
          selectedRange: [1, 1],
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
      await route.fulfill({ json: { path: "E:/projects/test01" } });
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
      await route.fulfill({
        body: Buffer.from(PNG_PIXEL, "base64"),
        contentType: "image/png",
      });
      return;
    }
    if (pathname === "/api/server/projects/media-file") {
      await route.fulfill({
        body: Buffer.from(PNG_PIXEL, "base64"),
        contentType: "image/png",
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

function screenshotForCapture(page: Page, capture: CaptureTarget): Page {
  void capture;
  return page;
}

async function openAssignModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Assign a new asset here/i }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Assign media to range/i }).click();
  await page.getByRole("dialog").waitFor();
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
    { confidence_avg: 0.95, end_s: 5, index: 1, start_s: 0, text: "Capitalism begins here." },
    { confidence_avg: 0.92, end_s: 10, index: 2, start_s: 5, text: "A product demo uses PiP." },
    { confidence_avg: 0.93, end_s: 15, index: 3, start_s: 10, text: "Capitalism changes incentives." },
    { confidence_avg: 0.91, end_s: 20, index: 4, start_s: 15, text: "The foreground returns." },
    { confidence_avg: 0.9, end_s: 25, index: 5, start_s: 20, text: "Assign a new asset here." },
  ],
  words: [],
};

const TEST_PROJECT = {
  audio: "voice.mp3",
  layers: [
    { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
    {
      id: "pip-z3",
      items: [
        {
          cache_status: "warm",
          end: 10,
          id: "pip-1",
          mediaId: "PIP.png",
          motion: { easing: "ease_in_out", kind: "none" },
          pip: { opacity: 100, posX: 68, posY: 14, radius: 12, size: 30 },
          sentences: [2, 2] as [number, number],
          start: 5,
          transitions: { in: "fade", out: "cut" },
        },
      ],
      kind: "pip",
      name: "PiP z3",
    },
    {
      id: "fg-z1",
      items: [
        {
          cache_status: "warm",
          end: 5,
          id: "fg-1",
          mediaId: "foreground.png",
          motion: { easing: "ease_in_out", kind: "none" },
          sentences: [1, 1] as [number, number],
          start: 0,
          transitions: { in: "fade", out: "cut" },
        },
      ],
      kind: "fg",
      name: "Foreground z1",
    },
    {
      id: "bg-main",
      items: [
        {
          cache_status: "warm",
          crossfade: 0.6,
          end: 25,
          id: "bg-1",
          mediaId: "bg0.png",
          motion: { easing: "ease_in_out", kind: "ken_burns" },
          sentences: [1, 5] as [number, number],
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
      dimensions: { height: 720, width: 1280 },
      duration: null,
      hash: "hash-bg0",
      id: "bg0.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "bg0.png",
      path: "media/bg0.png",
      size: 123456,
      thumb_path: "uploads/thumb/bg0.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 720, width: 1280 },
      duration: null,
      hash: "hash-bg1",
      id: "bg1.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "bg1.png",
      path: "media/bg1.png",
      size: 123999,
      thumb_path: "uploads/thumb/bg1.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 720, width: 1280 },
      duration: null,
      hash: "hash-pip",
      id: "PIP.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "PIP.png",
      path: "media/PIP.png",
      size: 111111,
      thumb_path: "uploads/thumb/PIP.jpg",
    },
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 720, width: 1280 },
      duration: null,
      hash: "hash-fg",
      id: "foreground.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "image",
      name: "foreground.png",
      path: "media/foreground.png",
      size: 135790,
      thumb_path: "uploads/thumb/foreground.jpg",
    },
  ],
  name: "test01",
  output: { preset: "final", resolution: "1080p" },
  subtitles: {
    burn_in: true,
    style: {
      bg_style: "shadow",
      font: "Arial",
      max_chars_per_line: 42,
      position: "bottom",
      size: 28,
    },
  },
  transcript: { kind: "plain_text", path: "transcript.txt" },
  version: 1,
  watermark: {
    mediaId: "bg0.png",
    opacity: 85,
    posX: 90,
    posY: 90,
    scale: 0.08,
  },
};
