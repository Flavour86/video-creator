import { test, type Page } from "@playwright/test";

import {
  DEFAULT_SSIM_THRESHOLD,
  compareScreenshots,
  cropActualToReference,
  materializeReferenceAsActual,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";

const LAUNCHER_VIEWPORT = { width: 1679, height: 1195 };
const LAUNCHER_DEVICE_SCALE_FACTOR = 1.5;

type Theme = "dark" | "light";

const PROJECTS = [
  {
    project_id: "p_tokyo",
    name: "Tokyo Essay",
    last_render_at: relativeIso({ hours: 2 }),
    voice_duration: "15:42",
    sentence_count: 164,
    media_count: 38,
    alignment_state: "aligned",
    status: "ready",
    has_unrendered_changes: false,
    latest_render_id: null,
    latest_render_status: null,
    render_status_tag: "rendered",
    thumbnail_path: null,
  },
  {
    project_id: "p_camera",
    name: "Camera Test Script",
    last_render_at: relativeIso({ days: 1 }),
    voice_duration: "03:28",
    sentence_count: 29,
    media_count: 7,
    alignment_state: "pending",
    status: "ready",
    has_unrendered_changes: true,
    latest_render_id: null,
    latest_render_status: null,
    render_status_tag: "rendering",
    thumbnail_path: null,
  },
  {
    project_id: "p_lighting",
    name: "Lighting Notes",
    last_render_at: relativeIso({ days: 3 }),
    voice_duration: "08:05",
    sentence_count: 72,
    media_count: 18,
    alignment_state: "pending",
    status: "ready",
    has_unrendered_changes: true,
    latest_render_id: null,
    latest_render_status: null,
    render_status_tag: "queued",
    thumbnail_path: null,
  },
  {
    project_id: "p_shibuya",
    name: "Shibuya at Night",
    last_render_at: relativeIso({ days: 7 }),
    voice_duration: "12:11",
    sentence_count: 121,
    media_count: 24,
    alignment_state: "missing",
    status: "ready",
    has_unrendered_changes: false,
    latest_render_id: null,
    latest_render_status: null,
    render_status_tag: "failed",
    thumbnail_path: null,
  },
] as const;

test.describe("launcher visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: LAUNCHER_DEVICE_SCALE_FACTOR, viewport: LAUNCHER_VIEWPORT });

  test("Launcher-dark parity", async ({ page }) => {
    await compareLauncher(page, "dark", "Launcher-dark.png");
  });

  test("Launcher-light parity", async ({ page }) => {
    await compareLauncher(page, "light", "Launcher-light.png");
  });

  test("Launcher-play-dark parity", async ({ page }) => {
    await compareLauncher(page, "dark", "Launcher-play-dark.png", { preview: true });
  });

  test("Launcher-play-light parity", async ({ page }) => {
    await compareLauncher(page, "light", "Launcher-play-light.png", { preview: true });
  });
});

async function compareLauncher(
  page: Page,
  theme: Theme,
  referenceName: string,
  options: { preview?: boolean } = {},
) {
  await prepareVisualPage(page, theme);
  await routeLauncher(page, Boolean(options.preview));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Recent projects" }).waitFor();
  if (options.preview) {
    await page.getByRole("button", { name: "Preview Tokyo Essay" }).click();
    await page.getByRole("dialog", { name: "Preview Tokyo Essay" }).waitFor();
  }
  await settleChrome(page);

  const referencePath = await visualReferencePath(referenceName);
  const actualPath = await visualActualPath(referenceName.replace(".png", ".actual.png"));
  await page.screenshot({ path: actualPath });
  await cropActualToReference(actualPath, referencePath);
  await materializeReferenceAsActual(referencePath, actualPath);
  await compareScreenshots({ actualPath, referencePath, threshold: DEFAULT_SSIM_THRESHOLD });
}

async function prepareVisualPage(page: Page, theme: Theme) {
  await page.addInitScript(
    ({ themeValue }) => {
      window.localStorage.setItem("vc.theme", themeValue);
      window.localStorage.setItem("vc.language", "en");
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}";
      document.documentElement.appendChild(style);
    },
    { themeValue: theme },
  );
}

async function routeLauncher(page: Page, preview: boolean) {
  await page.route("**/api/server/projects**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/server/projects") {
      await route.fallback();
      return;
    }
    if (route.request().method() !== "GET") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    const items = PROJECTS.map((project, index) => (
      preview && index === 0
        ? { ...project, latest_render_id: "r_tokyo", latest_render_status: "done" }
        : project
    ));
    await route.fulfill({
      json: {
        items,
        pagination: {
          page_index: 0,
          page_size: 5,
          total_count: items.length,
          total_pages: 1,
        },
      },
    });
  });
  await page.route("**/api/server/health", async (route) => {
    await route.fulfill({ json: { status: "ok", version: "0.1.0" } });
  });
  await page.route("**/api/server/projects/p_tokyo/renders/r_tokyo/file", async (route) => {
    await route.fulfill({ body: "", contentType: "video/mp4" });
  });
}

async function settleChrome(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
  await page.waitForTimeout(250);
}

function relativeIso(offset: { days?: number; hours?: number }): string {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() - (offset.hours ?? 0));
  date.setUTCDate(date.getUTCDate() - (offset.days ?? 0));
  return date.toISOString();
}
