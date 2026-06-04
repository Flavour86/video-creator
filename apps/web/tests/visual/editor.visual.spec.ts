import { Buffer } from "node:buffer";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  compareScreenshots,
  cropActualToReference,
  cropReferenceRegion,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";
import {
  EDITOR_VISUAL_CASES,
  V1_1_EDITOR_VISUAL_CASES,
  V1_1_VISUAL_REFERENCE_PREFIX,
  type EditorVisualAction,
  type EditorVisualCaptureTarget as CaptureTarget,
  type EditorVisualCase,
  type EditorVisualTheme as Theme,
} from "./editor-visual-cases";

const EDITOR_VIEWPORT = { width: 1679, height: 1194 };
const EDITOR_DEVICE_SCALE_FACTOR = 1.5;
const UI_SSIM_THRESHOLD = 0.9;
const TEST_PROJECT_ID = "p_test01";
const DEFAULT_SCENE_SEEK_SECONDS = 38.399;
const INSPECTOR_SEPARATOR = "\u00B7";
const INSPECTOR_SEPARATOR_PATTERN = /[\u00B7\u2022\u2219\u30FB]/g;
const BUG_EVIDENCE_DIR = path.resolve(process.cwd(), "..", "..", "docs", "designs", "bugs", "evidences");
const V1_1_BUG_SWEEP_EVIDENCE_DIR = path.resolve(process.cwd(), "..", "..", "docs", "designs", "bugs", "v1.1", "evidence");
const LEGACY_VISUAL_REFERENCES_DIR = path.resolve(process.cwd(), "..", "..", "docs", "designs", "visuals");
const BUG_SWEEP_VIEWPORTS = [
  { name: "1920x1080", portrait: false, viewport: { width: 1920, height: 1080 } },
  { name: "1280x720", portrait: false, viewport: { width: 1280, height: 720 } },
  { name: "1080x1920", portrait: true, viewport: { width: 1080, height: 1920 } },
] as const;

type IgnoreRegion = { x: number; y: number; width: number; height: number };
type BugSweepViewport = (typeof BUG_SWEEP_VIEWPORTS)[number];
type EditorApiOverrides = {
  alignment?: object | (() => object);
  onConfigSave?: (config: object) => void;
  project?: object | (() => object);
};

function visualReferenceExistsSync(reference: string): boolean {
  return fsSync.existsSync(path.join(LEGACY_VISUAL_REFERENCES_DIR, reference));
}

test.describe("editor visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: EDITOR_DEVICE_SCALE_FACTOR, viewport: EDITOR_VIEWPORT });

  for (const visualCase of EDITOR_VISUAL_CASES.filter((entry) => !entry.strict)) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareEditorVisualCase(page, visualCase);
    });
  }
});

test.describe("editor strict timeline bug visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: EDITOR_DEVICE_SCALE_FACTOR, viewport: { width: 1841, height: 1016 } });

  for (const visualCase of EDITOR_VISUAL_CASES.filter((entry) => entry.reference.includes("bug-27-1") && visualReferenceExistsSync(entry.reference))) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareEditorVisualCase(page, visualCase);
    });
  }
});

test.describe("editor strict modal bug visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: EDITOR_DEVICE_SCALE_FACTOR, viewport: { width: 1841, height: 1016 } });

  for (const visualCase of EDITOR_VISUAL_CASES.filter((entry) => entry.reference.includes("bug-28-1") && visualReferenceExistsSync(entry.reference))) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareEditorVisualCase(page, visualCase);
    });
  }
});

test.describe("editor v1.1 visual parity", () => {
  test.describe.configure({ mode: "serial" });

  for (const visualCase of V1_1_EDITOR_VISUAL_CASES) {
    test.describe(visualCase.name, () => {
      test.use({
        deviceScaleFactor: visualCase.deviceScaleFactor ?? 1,
        viewport: visualCase.viewport ?? EDITOR_VIEWPORT,
      });

      test(`${visualCase.reference} parity`, async ({ page }) => {
        await compareEditorVisualCase(page, visualCase);
      });
    });
  }
});

test.describe("v1.1 bug inspection evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.VC_BUG_SWEEP !== "1", "Set VC_BUG_SWEEP=1 to capture v1.1 bug-sweep evidence screenshots.");

  for (const target of BUG_SWEEP_VIEWPORTS) {
    test.describe(target.name, () => {
      test.use({ deviceScaleFactor: 1, viewport: target.viewport });

      test(`subtitle color/background controls ${target.name}`, async ({ page }) => {
        test.setTimeout(90_000);
        const monitor = monitorBugSweepPage(page);
        await captureSubtitleControlsSweep(page, target);
        expect(monitor.errors()).toEqual([]);
      });

      test(`autosave-only editor header ${target.name}`, async ({ page }) => {
        test.setTimeout(90_000);
        const monitor = monitorBugSweepPage(page);
        await captureAutosaveHeaderSweep(page, target);
        expect(monitor.errors()).toEqual([]);
      });

      test(`watermark controls ${target.name}`, async ({ page }) => {
        test.setTimeout(90_000);
        const monitor = monitorBugSweepPage(page);
        await captureWatermarkControlsSweep(page, target);
        expect(monitor.errors()).toEqual([]);
      });

      test(`transcript edit fixed height ${target.name}`, async ({ page }) => {
        test.setTimeout(90_000);
        const monitor = monitorBugSweepPage(page);
        await captureTranscriptEditSweep(page, target);
        expect(monitor.errors()).toEqual([]);
      });

      test(`background schedule ${target.name}`, async ({ page }) => {
        test.setTimeout(90_000);
        const monitor = monitorBugSweepPage(page);
        await captureBackgroundScheduleSweep(page, target);
        expect(monitor.errors()).toEqual([]);
      });
    });
  }
});

test.describe("bug 2026-05-28 evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.VC_BUG_EVIDENCE !== "1", "Set VC_BUG_EVIDENCE=1 to capture bug-batch evidence screenshots.");
  test.use({ deviceScaleFactor: 1, viewport: { width: 1841, height: 1016 } });

  test("captures editor evidence matrix", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location().url;
        consoleErrors.push(location ? `${message.text()} @ ${location}` : message.text());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    let activeProject: object = BUG_EVIDENCE_PROJECT;
    const evidenceCase: EditorVisualCase = {
      action: "none",
      capture: "page",
      name: "bug evidence",
      reference: "bug-evidence.png",
      theme: "dark",
    };

    await prepareVisualPage(page, "dark");
    await routeEditorApi(page, evidenceCase, { project: () => activeProject });
    await page.goto(`/editor/${TEST_PROJECT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await seekEvidenceTimeline(page, 38.399);

    await captureEvidence(page.getByTestId("editor-layout-grid").locator("aside").nth(1), "global-config-alignment.png");

    await page.getByRole("button", { name: /^Watermark$/i }).click();
    await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
    const watermarkDialog = page.getByRole("dialog");
    await expect(watermarkDialog.getByRole("button", { name: /qr-watermark\.png/i })).toBeVisible();
    await expect(watermarkDialog.getByText("neon-lights.jpg")).toHaveCount(0);
    await captureEvidence(watermarkDialog, "asset-scope-watermark.png");
    await captureEvidence(watermarkDialog, "watermark-upload-style.png");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Change Background/i }).click();
    await page.getByRole("heading", { name: /Change background/i }).waitFor();
    const backgroundDialog = page.getByRole("dialog");
    await expect(backgroundDialog.getByRole("button", { name: /neon-lights\.jpg/i })).toBeVisible();
    await expect(backgroundDialog.getByText("tokyo-skyline.jpg")).toHaveCount(0);
    await captureEvidence(backgroundDialog, "asset-scope-background.png");
    await page.keyboard.press("Escape");

    await openAssignModal(page);
    const assignDialog = page.getByRole("dialog");
    await expect(assignDialog.getByRole("button", { name: /tokyo-skyline\.jpg/i })).toBeVisible();
    await expect(assignDialog.getByText("neon-lights.jpg")).toHaveCount(0);
    await page.getByRole("button", { name: /Picture-in-picture/i }).click();
    await expect(assignDialog.getByRole("button", { name: /callout-map\.png/i })).toBeVisible();
    await expect(assignDialog.getByText("qr-watermark.png")).toHaveCount(0);
    await captureEvidence(assignDialog, "asset-scope-foreground-pip.png");
    await page.keyboard.press("Escape");

    await seekEvidenceTimeline(page, 100);
    await waitForPreviewMetadata(page, { hasBackground: "true" });
    await expectPreviewNonBlack(page);
    await captureEvidence(page.getByTestId("preview-stack"), "background-image-playlist-1080p.png");

    await setPlaybackTime(page, 63.5);
    await waitForPreviewMetadata(page, { hasBackground: "true" });
    await expectPreviewNonBlack(page);
    await captureEvidence(page.getByTestId("preview-stack"), "background-crossfade-preview.png");

    activeProject = BUG_EVIDENCE_VIDEO_BACKGROUND_PROJECT;
    await page.unroute("**/api/server/**");
    await routeEditorApi(page, evidenceCase, { project: () => activeProject });
    await page.goto(`/editor/${TEST_PROJECT_ID}?evidence=video`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await setPlaybackTime(page, 12);
    await waitForPreviewMetadata(page, { hasBackground: "false" });
    await expectPreviewMostlyBlack(page);
    await captureEvidence(page.getByTestId("preview-stack"), "background-video-playlist-short-fallback.png");

    activeProject = BUG_EVIDENCE_PROJECT;
    await page.unroute("**/api/server/**");
    await routeEditorApi(page, evidenceCase, { project: () => activeProject });
    await page.goto(`/editor/${TEST_PROJECT_ID}?evidence=transcript`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await seekEvidenceTimeline(page, 64);
    await expect(page.locator("[aria-current='true']")).toHaveCount(1);
    await captureEvidence(page.getByTestId("transcript-list"), "transcript-playhead-current-highlight.png");

    const timeline = page.getByTestId("timeline-waveform").locator("xpath=ancestor::section[1]");
    await captureEvidence(timeline, "timeline-seek-zone.png");
    await captureEvidence(timeline, "timeline-playhead-head-drag.png");
    await page.getByRole("button", { name: "tokyo-skyline.jpg over s6-s7" }).first().click();
    await captureEvidence(timeline, "timeline-clips-drag-resize.png");
    await captureEvidence(timeline, "timeline-grid-aligned-no-scrollbar.png");

    activeProject = BUG_27_PROJECT;
    await page.unroute("**/api/server/**");
    await routeEditorApi(page, evidenceCase, { project: () => activeProject });
    await page.goto(`/editor/${TEST_PROJECT_ID}?evidence=scrollbar`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await captureEvidence(page.getByTestId("timeline-waveform").locator("xpath=ancestor::section[1]"), "timeline-grid-aligned-scrollbar.png");

    activeProject = BUG_EVIDENCE_PROJECT;
    await page.unroute("**/api/server/**");
    await routeEditorApi(page, evidenceCase, { project: () => activeProject });
    await page.goto(`/editor/${TEST_PROJECT_ID}?evidence=subtitles`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await page.getByRole("button", { name: /^Subtitles$/i }).click();
    await page.getByRole("heading", { name: /^Subtitles$/i }).waitFor();
    await captureEvidence(page.getByRole("dialog"), "subtitle-preview-1080p.png");
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: "720p" }).click();
    await page.getByRole("button", { name: /^Subtitles$/i }).click();
    await page.getByRole("heading", { name: /^Subtitles$/i }).waitFor();
    await captureEvidence(page.getByRole("dialog"), "subtitle-preview-720p.png");
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: "9:16" }).click();
    await page.getByRole("button", { name: /^Subtitles$/i }).click();
    await page.getByRole("heading", { name: /^Subtitles$/i }).waitFor();
    await captureEvidence(page.getByRole("dialog"), "subtitle-preview-9x16.png");

    expect([...consoleErrors, ...failedResponses]).toEqual([]);
  });
});

test.describe("bug 2026-06-01 evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.VC_BUG_EVIDENCE !== "1", "Set VC_BUG_EVIDENCE=1 to capture bug-batch evidence screenshots.");
  test.use({ deviceScaleFactor: 1, viewport: { width: 1841, height: 1016 } });

  test("captures persistence, upload deletion, video preview, and timeline evidence", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location().url;
        consoleErrors.push(location ? `${message.text()} @ ${location}` : message.text());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await instrumentPreviewVideoDrawing(page);

    const evidenceCase: EditorVisualCase = {
      action: "none",
      capture: "page",
      name: "bug 2026-06-01 evidence",
      reference: "bug-2026-06-01-evidence.png",
      theme: "dark",
    };

    let activeProject: object = structuredClone(BUG_2026_06_01_PROJECT);

    await prepareVisualPage(page, "dark");
    await routeEditorApi(page, evidenceCase, {
      onConfigSave: (config) => {
        activeProject = config;
      },
      project: () => activeProject,
    });
    await page.goto(`/editor/${TEST_PROJECT_ID}?evidence=2026-06-01`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);

    await captureEvidence(page, "topbar-no-manual-save-autosave-state.png");
    await mutateEditorConfigForReloadEvidence(page);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "TokyoEssay" }).waitFor();
    await settleChrome(page);
    await verifyReloadedEditorMutations(page);

    await page.getByRole("button", { name: /^Watermark$/i }).click();
    await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
    const watermarkDialog = page.getByRole("dialog");
    await expect(watermarkDialog.getByRole("button", { name: /uploaded-watermark\.png selected/i })).toBeVisible();
    await expect(watermarkDialog.getByRole("button", { name: /delete uploaded-watermark\.png/i })).toBeVisible();
    await captureEvidence(watermarkDialog, "watermark-persisted-image-selected.png");
    await captureEvidence(watermarkDialog, "watermark-import-inline-enabled.png");
    await captureEvidence(watermarkDialog, "modal-uploaded-asset-delete-watermark.png");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Change Background/i }).click();
    await page.getByRole("heading", { name: /Change background/i }).waitFor();
    const backgroundDialog = page.getByRole("dialog");
    await expect(backgroundDialog.getByRole("button", { name: /uploaded-video-a\.mp4 selected/i })).toBeVisible();
    await expect(backgroundDialog.getByRole("img", { name: "uploaded-video-a.mp4" })).toBeVisible();
    await expect(backgroundDialog.getByRole("button", { name: /delete uploaded-video-a\.mp4/i })).toBeVisible();
    await captureEvidence(backgroundDialog, "asset-persists-after-refresh-background.png");
    await captureEvidence(backgroundDialog, "modal-uploaded-asset-delete-background.png");
    await captureEvidence(backgroundDialog, "background-video-thumbnail-visible.png");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Watermark$/i }).click();
    await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
    await captureEvidence(page.getByRole("dialog"), "asset-persists-after-refresh-watermark.png");
    await page.keyboard.press("Escape");

    await openAssignModal(page);
    const assignDialog = page.getByRole("dialog");
    await expect(assignDialog.getByRole("button", { name: /^uploaded-foreground\.png$/i })).toBeVisible();
    await expect(assignDialog.getByRole("button", { name: /delete uploaded-foreground\.png/i })).toBeVisible();
    await page.getByRole("button", { name: /Picture-in-picture/i }).click();
    await expect(assignDialog.getByRole("button", { name: /^uploaded-pip\.png$/i })).toBeVisible();
    await expect(assignDialog.getByRole("button", { name: /delete uploaded-pip\.png/i })).toBeVisible();
    await captureEvidence(assignDialog, "modal-uploaded-asset-delete-foreground-pip.png");
    await page.keyboard.press("Escape");

    await setPlaybackTime(page, 2.5);
    await waitForPreviewMetadata(page, { drawOrderIncludes: "bg", hasBackground: "true" });
    await expectPreviewNonBlack(page);
    const firstVideoStats = await previewCanvasStats(page);
    await captureEvidence(page.getByTestId("preview-stack"), "preview-video-background-1080p.png");

    await page.getByRole("radio", { name: "720p" }).click();
    await setPlaybackTime(page, 3.5);
    await waitForPreviewMetadata(page, { drawOrderIncludes: "bg", hasBackground: "true" });
    const secondVideoStats = await previewCanvasStats(page);
    expect(Math.abs(secondVideoStats.averageLuminance - firstVideoStats.averageLuminance)).toBeGreaterThan(1);
    await captureEvidence(page.getByTestId("preview-stack"), "preview-video-background-720p.png");

    await page.getByRole("radio", { name: "9:16" }).click();
    await setPlaybackTime(page, 4.5);
    await waitForPreviewMetadata(page, { drawOrderIncludes: "bg", hasBackground: "true" });
    await captureEvidence(page.getByTestId("preview-stack"), "preview-video-background-9x16.png");

    await setPlaybackTime(page, 6.5);
    await waitForPreviewMetadata(page, { drawOrderIncludes: "bg", hasBackground: "true" });
    await captureEvidence(page.getByTestId("preview-stack"), "preview-multi-video-background-continuity.png");

    await seekEvidenceTimeline(page, 33.5);
    const timeline = page.getByTestId("timeline-waveform").locator("xpath=ancestor::section[1]");
    await captureEvidence(timeline, "timeline-overlap-clip-drag-no-playhead-move.png");
    await captureEvidence(timeline, "timeline-playhead-head-only-drag.png");

    expect([...consoleErrors, ...failedResponses]).toEqual([]);
  });
});

async function mutateEditorConfigForReloadEvidence(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Watermark$/i }).click();
  await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
  await waitForConfigAutosave(page, async () => {
    await page.getByLabel("Watermark POSX").fill("30");
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "auto / 2 assets" }).click();
  await waitForConfigAutosave(page, async () => {
    await page.locator("#editor-bg-crossfade").fill("0.2");
  });

  await page.getByRole("button", { exact: true, name: "upload-foreground-1 over s6-s7" }).click();
  await waitForConfigAutosave(page, async () => {
    await page.getByLabel("Foreground motion").selectOption("zoom_in");
  });
}

async function verifyReloadedEditorMutations(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Watermark$/i }).click();
  await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
  await expect(page.getByLabel("Watermark POSX")).toHaveValue("30");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "auto / 2 assets" }).click();
  await expect(page.locator("#editor-bg-crossfade")).toHaveValue("0.2");

  await page.getByRole("button", { exact: true, name: "upload-foreground-1 over s6-s7" }).click();
  await expect(page.getByLabel("Foreground motion")).toHaveValue("zoom_in");
}

async function waitForConfigAutosave(page: Page, action: () => Promise<void>): Promise<void> {
  const save = page.waitForResponse((response) => (
    response.url().includes(`/api/server/projects/${TEST_PROJECT_ID}/config`)
      && response.request().method() === "PUT"
  ));
  await action();
  await save;
  await settleChrome(page);
}

async function compareEditorVisualCase(page: Page, visualCase: EditorVisualCase): Promise<void> {
  const fixture = fixtureForVisualCase(visualCase);
  const expectedProjectName = (fixture?.project as { name?: string } | undefined)?.name ?? "TokyoEssay";
  await prepareVisualPage(page, visualCase.theme, visualCase);
  await routeEditorApi(page, visualCase);
  await page.goto(`/editor/${TEST_PROJECT_ID}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: expectedProjectName }).waitFor();
  await settleChrome(page);
  await setReferencePlayback(page);

  await runEditorVisualAction(page, visualCase.action);
  await page.waitForTimeout(100);
  const actualPath = await visualActualPath(path.basename(visualCase.reference).replace(".png", ".actual.png"));
  const sourceReferencePath = await visualReferencePath(visualCase.reference);
  const referencePath = visualCase.referenceClip
    ? await cropReferenceRegion(
        sourceReferencePath,
        actualPath.replace(".actual.png", ".reference-crop.png"),
        visualCase.referenceClip,
      )
    : sourceReferencePath;
  const captureTarget = screenshotForCapture(page, visualCase.capture);
  if (isLocator(captureTarget)) {
    await captureTarget.waitFor({ state: "visible" });
  }
  const screenshotOptions = visualCase.clip ? { clip: visualCase.clip, path: actualPath } : { path: actualPath };
  await captureTarget.screenshot(screenshotOptions);
  await cropActualToReference(actualPath, referencePath);
  const ignoreRegions: IgnoreRegion[] = [];
  let blurRadius = visualCase.blurRadius ?? 0;
  if (!visualCase.strict) {
    if (visualCase.capture === "page") {
      const previewRegion = await locatePreviewCanvasRegion(page);
      if (previewRegion) ignoreRegions.push(previewRegion);
      blurRadius = 4;
    } else if (visualCase.capture === "timeline") {
      ignoreRegions.push({ x: 0, y: 0, width: 200, height: 501 });
      ignoreRegions.push({ x: 150, y: 60, width: 1314, height: 110 });
      blurRadius = 16;
    } else if (visualCase.capture === "inspector") {
      ignoreRegions.push({ x: 150, y: 120, width: 330, height: 1240 });
      blurRadius = 12;
    } else if (visualCase.capture === "dialog") {
      ignoreRegions.push({ x: 250, y: 80, width: 2000, height: 1520 });
      blurRadius = 16;
    }
    if (visualCase.reference === "editor-transcript-1.png") {
      ignoreRegions.push({ x: 180, y: 0, width: 390, height: 1236 });
      blurRadius = 12;
    }
    if (visualCase.reference === "editor-transcript-2.png") {
      ignoreRegions.push({ x: 220, y: 0, width: 602, height: 449 });
      blurRadius = 12;
    }
    if (visualCase.reference === "editor-transcript-3.png") {
      ignoreRegions.push({ x: 220, y: 0, width: 690, height: 806 });
      blurRadius = 14;
    }
  }
  await compareScreenshots({
    actualPath,
    blurRadius,
    ignoreRegions: ignoreRegions.length > 0 ? ignoreRegions : undefined,
    referencePath,
    stateName: visualCase.name,
    threshold: visualCase.threshold ?? UI_SSIM_THRESHOLD,
  });
}

function bugSweepVisualCase(action: EditorVisualAction, name: string): EditorVisualCase {
  return {
    action,
    capture: "page",
    name,
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}${name}.png`,
    theme: "dark",
  };
}

function monitorBugSweepPage(page: Page): { errors: () => string[] } {
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
  return {
    errors: () => [...consoleErrors, ...failedResponses],
  };
}

async function openBugSweepEditor(
  page: Page,
  visualCase: EditorVisualCase,
  target: BugSweepViewport,
  overrides: EditorApiOverrides = {},
): Promise<void> {
  const fixture = fixtureForVisualCase(visualCase);
  const expectedProjectName = (fixture?.project as { name?: string } | undefined)?.name ?? "TokyoEssay";
  await prepareVisualPage(page, visualCase.theme, visualCase);
  await routeEditorApi(page, visualCase, overrides);
  await page.goto(`/editor/${TEST_PROJECT_ID}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: expectedProjectName }).waitFor();
  await settleChrome(page);
  if (target.portrait) {
    await page.getByRole("radio", { name: "9:16" }).click();
  }
  await setReferencePlayback(page);
}

async function captureSubtitleControlsSweep(page: Page, target: BugSweepViewport): Promise<void> {
  let activeProject: object = structuredClone(V1_SUBTITLE_PROJECT);
  const visualCase = bugSweepVisualCase("v1-subtitles-modal-color-bg", "bug-sweep-subtitles");
  await openBugSweepEditor(page, visualCase, target, {
    onConfigSave: (config) => {
      activeProject = config;
    },
    project: () => activeProject,
  });

  const modal = await openSubtitlesModal(page);
  await expect(modal.getByLabel("Max chars / line")).toHaveCount(0);
  await expect(modal.locator("#editor-sub-color")).toBeVisible();
  await expect(modal.locator("#editor-sub-bg-color")).toBeVisible();
  await setSubtitleBlockStyle(modal);
  await expect(modal.getByLabel("Opacity", { exact: true })).toBeEnabled();
  await expect(modal.getByLabel("Radius", { exact: true })).toBeEnabled();

  await modal.getByRole("combobox", { exact: true, name: "Background" }).selectOption("none");
  await expect(modal.locator("#editor-sub-bg-color")).toBeDisabled();
  await expect(modal.getByLabel("Opacity", { exact: true })).toBeDisabled();
  await expect(modal.getByLabel("Radius", { exact: true })).toBeDisabled();

  await modal.getByRole("combobox", { exact: true, name: "Background" }).selectOption("shadow");
  await expect(modal.locator("#editor-sub-bg-color")).toBeDisabled();
  await expect(modal.getByLabel("Opacity", { exact: true })).toBeDisabled();
  await expect(modal.getByLabel("Radius", { exact: true })).toBeDisabled();

  await modal.getByRole("combobox", { exact: true, name: "Background" }).selectOption("pill");
  await expect(modal.locator("#editor-sub-bg-color")).toBeEnabled();
  await expect(modal.getByLabel("Opacity", { exact: true })).toBeEnabled();
  await expect(modal.getByLabel("Radius", { exact: true })).toBeDisabled();

  await setSubtitleBlockStyle(modal);
  await waitForConfigAutosave(page, async () => {
    await modal.getByRole("button", { name: "Apply" }).click();
  });
  await expect(page.getByLabel("Autosave saved")).toBeVisible();

  const reopened = await openSubtitlesModal(page);
  await expect(reopened.locator("#editor-sub-color")).toHaveValue("#ffcc00");
  await expect(reopened.locator("#editor-sub-bg-color")).toHaveValue("#112233");
  await expect(reopened.getByLabel("Opacity", { exact: true })).toHaveValue("45");
  await expect(reopened.getByLabel("Radius", { exact: true })).toHaveValue("14");
  await captureBugSweepEvidence(page, "subtitles-controls", target);
}

async function captureAutosaveHeaderSweep(page: Page, target: BugSweepViewport): Promise<void> {
  let activeProject: object = structuredClone(V1_SUBTITLE_PROJECT);
  const savedProjects: object[] = [];
  const visualCase = bugSweepVisualCase("v1-subtitles-modal-color-bg", "bug-sweep-autosave");
  await openBugSweepEditor(page, visualCase, target, {
    onConfigSave: (config) => {
      activeProject = config;
      savedProjects.push(config);
    },
    project: () => activeProject,
  });

  await expect(page.getByRole("button", { name: /^Save$/i })).toHaveCount(0);
  await expect(page.getByLabel(/Autosave (status|saved)/i)).toBeVisible();

  const modal = await openSubtitlesModal(page);
  await modal.locator("#editor-sub-color").fill("#ffcc00");
  await modal.locator("#editor-sub-bg-color").fill("#112233");
  await waitForConfigAutosave(page, async () => {
    await modal.getByRole("button", { name: "Apply" }).click();
  });
  await expect(page.getByLabel("Autosave saved")).toBeVisible();
  await expect.poll(() => savedProjects.length).toBeGreaterThan(0);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Task 5 subtitle modal controls" }).waitFor();
  const persisted = await openSubtitlesModal(page);
  await expect(persisted.locator("#editor-sub-color")).toHaveValue("#ffcc00");
  await expect(persisted.locator("#editor-sub-bg-color")).toHaveValue("#112233");
  await persisted.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /Render final \(ready\)/i })).toBeEnabled();
  await captureBugSweepEvidence(page, "autosave-header", target);
}

async function captureWatermarkControlsSweep(page: Page, target: BugSweepViewport): Promise<void> {
  let activeProject: object = structuredClone(V1_WATERMARK_PROJECT);
  const visualCase = bugSweepVisualCase("v1-watermark-modal", "bug-sweep-watermark");
  await openBugSweepEditor(page, visualCase, target, {
    onConfigSave: (config) => {
      activeProject = config;
    },
    project: () => activeProject,
  });

  await page.getByTestId("editor-inspector").getByRole("button", { name: /^Watermark$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Watermark asset$/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: /watermark-logo\.png selected/i })).toBeVisible();
  await expect(modal.getByLabel("Watermark POSX")).toBeVisible();
  await expect(modal.getByLabel("Watermark POSY")).toBeVisible();
  await expect(modal.getByLabel("Watermark size")).toBeVisible();
  await expect(modal.getByLabel("Watermark opacity")).toBeVisible();

  await waitForConfigAutosave(page, async () => {
    await modal.getByLabel("Watermark POSX").fill("30");
  });
  await waitForConfigAutosave(page, async () => {
    await modal.getByLabel("Watermark POSY").fill("70");
  });
  await waitForConfigAutosave(page, async () => {
    await modal.getByLabel("Watermark size").fill("0.16");
  });
  await waitForConfigAutosave(page, async () => {
    await modal.getByLabel("Watermark opacity").fill("42");
  });
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-watermark-visible", "true");
  await captureBugSweepEvidence(page, "watermark-controls", target);

  await waitForConfigAutosave(page, async () => {
    await modal.getByRole("switch", { name: "Watermark enabled" }).click();
  });
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-watermark-visible", "false");
}

async function captureTranscriptEditSweep(page: Page, target: BugSweepViewport): Promise<void> {
  let activeProject: object = structuredClone(V1_TRANSCRIPT_PROJECT);
  const visualCase = bugSweepVisualCase("v1-transcript-edit", "bug-sweep-transcript");
  await openBugSweepEditor(page, visualCase, target, {
    onConfigSave: (config) => {
      activeProject = config;
    },
    project: () => activeProject,
  });

  await expect(page.getByRole("button", { name: /edit sentence 1/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /edit sentence 2/i })).toBeVisible();
  const row2 = page.getByTestId("transcript-sentence-row-2");
  const row3 = page.getByTestId("transcript-sentence-row-3");
  const before = await row2.boundingBox();
  await page.getByRole("button", { name: /edit sentence 2/i }).click();
  const editor = page.getByRole("textbox", { name: /edit sentence 2 text/i });
  await expect(editor).toBeVisible();
  const editing = await row2.boundingBox();
  const adjacent = await row3.boundingBox();
  expect(before).not.toBeNull();
  expect(editing).not.toBeNull();
  expect(adjacent).not.toBeNull();
  expect(Math.abs((editing?.height ?? 0) - (adjacent?.height ?? 0))).toBeLessThanOrEqual(1);

  await editor.fill("Integrated browser flow edited this transcript sentence.");
  await waitForConfigAutosave(page, async () => {
    await page.getByRole("button", { name: /confirm sentence 2 edit/i }).click();
  });
  await expect(page.getByTestId("transcript-sentence-text-2")).toContainText("Integrated browser flow edited this transcript sentence.");
  await expect(page.getByLabel("Autosave saved")).toBeVisible();

  await page.getByRole("button", { name: /edit sentence 2/i }).click();
  const whitespaceEditor = page.getByRole("textbox", { name: /edit sentence 2 text/i });
  await whitespaceEditor.fill("   ");
  await expect(page.getByRole("button", { name: /confirm sentence 2 edit/i })).toBeDisabled();
  await page.getByRole("button", { name: /cancel sentence 2 edit/i }).click();
  await expect(page.getByTestId("transcript-sentence-text-2")).toContainText("Integrated browser flow edited this transcript sentence.");
  await page.getByRole("button", { name: /edit sentence 2/i }).click();
  await expect(page.getByRole("textbox", { name: /edit sentence 2 text/i })).toHaveValue("Integrated browser flow edited this transcript sentence.");
  await captureBugSweepEvidence(page, "transcript-edit", target);
}

async function captureBackgroundScheduleSweep(page: Page, target: BugSweepViewport): Promise<void> {
  let activeProject: object = structuredClone(V1_BACKGROUND_PROJECT);
  const visualCase = bugSweepVisualCase("v1-background-coverage-modal", "bug-sweep-background");
  await openBugSweepEditor(page, visualCase, target, {
    onConfigSave: (config) => {
      activeProject = config;
    },
    project: () => activeProject,
  });

  await page.getByRole("button", { name: /^Change Background$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Change background$/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId("background-selected-count")).toHaveText("3 selected");
  await expect(modal.getByTestId("background-selected-count")).not.toContainText(/mixed|image|video/i);
  await expect(modal.getByTestId("background-asset-grid")).toHaveAttribute("data-asset-count", String(V1_BACKGROUND_MEDIA.length));
  await expect(modal.getByTestId("background-asset-grid")).toHaveClass(/overflow-y-auto/);
  await expect(modal.getByTestId("background-coverage-grid")).toHaveAttribute("data-row-count", "3");
  await expect(modal.getByLabel("End bg-red.png")).toBeEnabled();
  await expect(modal.getByLabel("Hold bg-red.png")).toBeEnabled();
  await expect(modal.getByLabel("Start bg-video.mp4")).toBeEnabled();
  await expect(modal.getByLabel("End bg-video.mp4")).toBeDisabled();
  await expect(modal.getByLabel("Hold bg-video.mp4")).toBeDisabled();

  await modal.getByLabel("End bg-red.png").fill("01:10");
  await expect(modal.getByLabel("End bg-red.png")).toHaveValue("01:10");

  await modal.getByRole("button", { name: /^bg-crowded-1\.png$/i }).click();
  await modal.getByRole("button", { name: /^a-very-long-background-name-that-must-truncate-in-the-coverage-grid\.jpg$/i }).click();
  await expect(modal.getByTestId("background-selected-count")).toHaveText("5 selected");
  await expect(modal.getByTestId("background-selected-count")).not.toContainText(/mixed|image|video/i);
  await expect(modal.getByTestId("background-coverage-grid")).toHaveAttribute("data-row-count", "5");
  await modal.getByLabel("Start bg-video.mp4").fill("01:15");
  await expect(modal.getByLabel("Start bg-video.mp4")).toHaveValue("01:15");
  await expect(modal.getByLabel("End bg-video.mp4")).toHaveValue("01:19");
  await expect(modal.getByLabel("Hold bg-video.mp4")).toHaveValue("00:04");
  await expect(modal.getByLabel("Start bg-blue.png")).toHaveValue("01:19");
  await expectRowsStayInsideCoverageGrid(modal, [
    "bg-red.png",
    "bg-video.mp4",
    "bg-blue.png",
    "bg-crowded-1.png",
    "bg-extra-long-name.jpg",
  ]);

  const blueRow = modal.getByTestId("background-coverage-row-bg-blue.png");
  const redRow = modal.getByTestId("background-coverage-row-bg-red.png");
  await pointerDrag(page, blueRow, redRow);
  await expect(modal.locator("[data-testid^='background-coverage-row-']").first()).toHaveAttribute("data-media-id", "bg-blue.png");
  await captureBugSweepEvidence(page, "background-schedule", target);

  await waitForConfigAutosave(page, async () => {
    await modal.getByRole("button", { name: "Save changes" }).click();
  });
  await expect(page.getByLabel("Autosave saved")).toBeVisible();
  await page.getByRole("button", { name: /timed ranges \/ 5 assets/i }).click();
  await expect(page.getByRole("heading", { name: /^Coverage schedule$/i })).toHaveCount(0);
  await expect(page.locator("[data-testid='timeline-row-bg'] [data-timeline-clip='true']")).toHaveCount(1);
}


async function runEditorVisualAction(page: Page, action: EditorVisualAction): Promise<void> {
  switch (action) {
    case "none":
      return;
    case "render-draft":
      await page.getByRole("button", { name: "tokyo-skyline.jpg over s6-s7" }).first().click();
      await waitForInspectorHeading(page, inspectorHeading("Foreground", 1));
      await setReferencePlayback(page);
      await mockDraftRenderSocket(page);
      await page.getByRole("button", { name: /render draft/i }).click();
      await page.getByText(/pre-rendering clips/i).first().waitFor();
      return;
    case "transcript-selection-range": {
      const ninth = page.getByRole("button", { name: /A folder on your disk is the project/i }).first();
      const thirteenth = page.getByRole("button", { name: /On a Blackwell GPU it finishes/i }).first();
      await ninth.click();
      await thirteenth.click({ modifiers: ["Shift"] });
      return;
    }
    case "transcript-context-menu": {
      const sentence = page.getByRole("button", { name: /Open the folder elsewhere/i }).first();
      await sentence.click({ button: "right" });
      await page.getByRole("menuitem", { name: /assign media to range/i }).waitFor();
      return;
    }
    case "transcript-merge-action": {
      const ninth = page.getByRole("button", { name: /A folder on your disk is the project/i }).first();
      const eleventh = page.getByRole("button", { name: /The editor itself is a single browser tab/i }).first();
      const tenth = page.getByRole("button", { name: /Open the folder elsewhere/i }).first();
      await ninth.click();
      await eleventh.click({ modifiers: ["Shift"] });
      await tenth.click({ button: "right" });
      await page.getByRole("menuitem", { name: /merge 3 sentences/i }).waitFor();
      return;
    }
    case "preview-9x16":
      await page.getByRole("radio", { name: "9:16" }).click();
      return;
    case "preview-layers-popover":
      await page.getByRole("button", { name: /Layers -/i }).click();
      await page.getByText(/Layer order - top renders on top/i).waitFor();
      return;
    case "inspector-dark":
      await page.getByRole("button", { name: "quote-card.png over s9-s11" }).first().click();
      await waitForInspectorHeading(page, inspectorHeading("PiP", 4));
      return;
    case "inspector-light":
      await page.getByRole("button", { name: "callout-map.png over s6-s10" }).first().click();
      await waitForInspectorHeading(page, inspectorHeading("PiP", 3));
      return;
    case "inspector-foreground":
      await page.getByRole("button", { name: "quote-card.png over s10-s11" }).first().click();
      await waitForInspectorHeading(page, inspectorHeading("Foreground", 1));
      return;
    case "assign-modal":
      await openAssignModal(page);
      return;
    case "assign-modal-edit":
      await openAssignEditModal(page);
      return;
    case "assign-modal-edit-scrolled": {
      await openAssignEditModal(page);
      const body = page.getByTestId("assign-modal-body");
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      return;
    }
    case "assign-modal-scrolled": {
      await openAssignModal(page);
      const body = page.getByTestId("assign-modal-body");
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      return;
    }
    case "background-modal":
      await page.getByRole("button", { name: /Change Background/i }).click();
      await page.getByRole("heading", { name: /Change background/i }).waitFor();
      return;
    case "subtitles-modal":
      await page.getByRole("button", { name: /^Subtitles$/i }).click();
      await page.getByRole("heading", { name: /^Subtitles$/i }).waitFor();
      return;
    case "watermark-modal":
      await page.getByRole("button", { name: /^Watermark$/i }).click();
      await page.getByRole("heading", { name: /^Watermark asset$/i }).waitFor();
      return;
    case "v1-subtitles-modal-color-bg": {
      const modal = await openSubtitlesModal(page);
      await setSubtitleBlockStyle(modal);
      return;
    }
    case "v1-subtitles-modal-none": {
      const modal = await openSubtitlesModal(page);
      await modal.getByRole("combobox", { exact: true, name: "Background" }).selectOption("none");
      await expect(modal.getByLabel("Opacity", { exact: true })).toBeDisabled();
      await expect(modal.getByLabel("Radius", { exact: true })).toBeDisabled();
      return;
    }
    case "v1-watermark-modal": {
      await page.getByTestId("editor-inspector").getByRole("button", { name: /^Watermark$/i }).click();
      const modal = page.getByRole("dialog", { name: /^Watermark asset$/i });
      await expect(modal.getByLabel("Watermark POSX")).toBeVisible();
      await expect(modal.getByLabel("Watermark POSY")).toBeVisible();
      await expect(modal.getByLabel("Watermark size")).toBeVisible();
      await expect(modal.getByLabel("Watermark opacity")).toBeVisible();
      return;
    }
    case "v1-transcript-edit":
      await page.getByRole("button", { name: /edit sentence 2/i }).click();
      await expect(page.getByRole("textbox", { name: /edit sentence 2 text/i })).toBeVisible();
      return;
    case "v1-background-coverage-modal":
      await page.getByRole("button", { name: /^Change Background$/i }).click();
      await expect(page.getByTestId("background-coverage-grid")).toHaveAttribute("data-row-count", "3");
      return;
    case "v1-background-coverage-editor":
      await page.getByRole("button", { name: "timed ranges / 3 assets" }).click();
      await expect(page.getByRole("heading", { name: /^Coverage schedule$/i })).toHaveCount(0);
      await expect(page.locator("[data-testid='timeline-row-bg'] [data-timeline-clip='true']")).toHaveCount(1);
      return;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function normalizeInspectorHeading(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INSPECTOR_SEPARATOR_PATTERN, INSPECTOR_SEPARATOR)
    .replace(/\s*\u00B7\s*/g, ` ${INSPECTOR_SEPARATOR} `)
    .replace(/^(PiP|Foreground)\s*\u00B7\s*\1\s*\u00B7\s*/i, `$1 ${INSPECTOR_SEPARATOR} `)
    .replace(/\s+/g, " ")
    .trim();
}

function inspectorHeading(kind: "PiP" | "Foreground", z: number): string {
  return `${kind} ${INSPECTOR_SEPARATOR} z${z}`;
}

async function waitForInspectorHeading(page: Page, expected: string): Promise<void> {
  const inspector = page.getByTestId("editor-layout-grid").locator("aside").nth(1);
  const contextualHeading = inspector.getByRole("heading").filter({ hasText: /z\d+/i }).first();
  const expectedNormalized = normalizeInspectorHeading(expected);
  await contextualHeading.waitFor({ state: "visible" });
  await expect
    .poll(
      async () => {
        const heading = await contextualHeading.textContent();
        return normalizeInspectorHeading(heading ?? "");
      },
      { message: `Expected inspector heading ${expectedNormalized}`, timeout: 10_000 },
    )
    .toBe(expectedNormalized);
}

async function prepareVisualPage(page: Page, theme: Theme, visualCase?: EditorVisualCase): Promise<void> {
  const selected = isV1_1VisualCase(visualCase) ? null : { itemId: "pip-001", layerId: "L-pip-1" };
  const selectedRange = isV1_1VisualCase(visualCase) ? null : [6, 7];
  await page.addInitScript(
    ({ projectId, selectedItem, selectedRangeValue, themeValue }) => {
      window.localStorage.setItem("vc.theme", themeValue);
      window.localStorage.setItem("vc.language", "en");
      window.localStorage.setItem(`vc.editor.operations.${projectId}`, JSON.stringify({ redo: [], undo: [], version: 1 }));
      window.localStorage.setItem(
        `vc.editor.recovery.${projectId}`,
        JSON.stringify({
          resolution: "1080p",
          selected: selectedItem,
          selectedRange: selectedRangeValue,
          transcriptScrollTop: 0,
          version: 1,
        }),
      );
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}";
      const appendStyle = () => {
        const target = document.documentElement ?? document.head ?? document.body;
        if (!target) return false;
        target.appendChild(style);
        return true;
      };
      if (!appendStyle()) {
        document.addEventListener("DOMContentLoaded", appendStyle, { once: true });
      }
    },
    { projectId: TEST_PROJECT_ID, selectedItem: selected, selectedRangeValue: selectedRange, themeValue: theme },
  );
}

async function routeEditorApi(page: Page, visualCase: EditorVisualCase, overrides: EditorApiOverrides = {}): Promise<void> {
  const usesPackedTimelineFixture = visualCase.reference.includes("bug-27-1")
    || visualCase.reference.startsWith("editor-timeline-");
  const fixture = fixtureForVisualCase(visualCase);

  await page.route("**/_next/image**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const target = url.searchParams.get("url") || "";
    let filename = "";
    try {
      filename = new URL(target, request.url()).searchParams.get("filename") || "";
    } catch {
      filename = target;
    }
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
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/inspect` && method === "POST") {
      await route.fulfill({ json: { path: "E:/projects/TokyoEssay" } });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/alignment` && method === "GET") {
      const alignment = overrideValue(overrides.alignment) ?? fixture?.alignment ?? (usesPackedTimelineFixture ? BUG_27_ALIGNMENT : TEST_ALIGNMENT);
      await route.fulfill({ json: alignment });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/config` && method === "GET") {
      const project = overrideValue(overrides.project) ?? fixture?.project ?? (usesPackedTimelineFixture ? BUG_27_PROJECT : TEST_PROJECT);
      await route.fulfill({
        json: {
          config: project,
          config_hash: "h-visual",
          has_unrendered_changes: true,
          last_rendered_config_hash: null,
          project_id: TEST_PROJECT_ID,
        },
      });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/config` && method === "PUT") {
      const payload = request.postDataJSON() as { config?: object };
      if (payload.config) {
        overrides.onConfigSave?.(payload.config);
      }
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
    if (pathname.includes(`/api/server/projects/${TEST_PROJECT_ID}/render-cache`) && method === "GET") {
      const totalCount = fixture?.renderCacheTotal ?? (usesPackedTimelineFixture ? 24 : 6);
      await route.fulfill({ json: { cached_count: totalCount, state: "warm", total_count: totalCount } });
      return;
    }
    if (pathname === `/api/server/projects/${TEST_PROJECT_ID}/render/r-visual` && method === "DELETE") {
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
    if (pathname === "/api/server/uploads/media-file") {
      await route.fulfill({
        body: "",
        contentType: "video/mp4",
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

function overrideValue<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T)() : value;
}

function isV1_1VisualCase(visualCase?: EditorVisualCase): boolean {
  return visualCase?.reference.startsWith("../tasks/v1.1/visuals/") ?? false;
}

function fixtureForVisualCase(visualCase: EditorVisualCase): { alignment: object; project: object; renderCacheTotal?: number } | null {
  switch (visualCase.action) {
    case "v1-subtitles-modal-color-bg":
    case "v1-subtitles-modal-none":
      return { alignment: V1_SUBTITLE_ALIGNMENT, project: V1_SUBTITLE_PROJECT, renderCacheTotal: 0 };
    case "v1-watermark-modal":
      return { alignment: V1_WATERMARK_ALIGNMENT, project: V1_WATERMARK_PROJECT, renderCacheTotal: 0 };
    case "v1-transcript-edit":
      return { alignment: V1_TRANSCRIPT_ALIGNMENT, project: V1_TRANSCRIPT_PROJECT, renderCacheTotal: 0 };
    case "v1-background-coverage-editor":
    case "v1-background-coverage-modal":
      return { alignment: V1_BACKGROUND_ALIGNMENT, project: V1_BACKGROUND_PROJECT, renderCacheTotal: 3 };
    default:
      return null;
  }
}

async function openSubtitlesModal(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^Subtitles$/i }).click();
  const modal = page.getByRole("dialog", { name: /^Subtitles$/i });
  await expect(modal).toBeVisible();
  return modal;
}

async function setSubtitleBlockStyle(modal: Locator): Promise<void> {
  await modal.getByRole("combobox", { exact: true, name: "Background" }).selectOption("block");
  await modal.getByRole("textbox", { exact: true, name: "Color" }).fill("#ffcc00");
  await modal.getByRole("textbox", { exact: true, name: "Background color" }).fill("#112233");
  await modal.getByLabel("Opacity", { exact: true }).fill("45");
  await modal.getByLabel("Radius", { exact: true }).fill("14");
  await expect(modal.getByTestId("subtitles-preview-cue")).toHaveCSS("color", "rgb(255, 204, 0)");
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
  if (capture === "watermark-dialog") {
    return page.getByRole("dialog");
  }
  return page;
}

function isLocator(target: Page | Locator): target is Locator {
  return typeof (target as Locator).waitFor === "function";
}

async function locatePreviewCanvasRegion(page: Page): Promise<IgnoreRegion | null> {
  const bounds = await page.getByTestId("preview-canvas").boundingBox();
  if (!bounds) return null;
  const padding = 8;
  const scaledX = bounds.x * EDITOR_DEVICE_SCALE_FACTOR;
  const scaledY = bounds.y * EDITOR_DEVICE_SCALE_FACTOR;
  const scaledWidth = bounds.width * EDITOR_DEVICE_SCALE_FACTOR;
  const scaledHeight = bounds.height * EDITOR_DEVICE_SCALE_FACTOR;
  return {
    x: Math.max(0, Math.floor(scaledX) - padding),
    y: Math.max(0, Math.floor(scaledY) - padding),
    width: Math.ceil(scaledWidth) + padding * 2,
    height: Math.ceil(scaledHeight) + padding * 2,
  };
}

async function openAssignModal(page: Page): Promise<void> {
  const sentence = page.getByRole("button", { name: /You record voice, you write transcript/i }).first();
  await sentence.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Assign media to range/i }).click();
  await page.getByRole("heading", { name: /Assign media|Edit media/i }).first().waitFor();
  await page.getByRole("button", { name: /tokyo-skyline\.jpg/i }).first().click();
}

async function openAssignEditModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "callout-map.png over s6-s10" }).first().click();
  await waitForInspectorHeading(page, inspectorHeading("PiP", 3));
  const inspector = page.getByTestId("editor-layout-grid").locator("aside").nth(1);
  await inspector.getByRole("button", { name: /callout-map\.png/i }).first().click();
  await page.getByRole("heading", { name: /Assign media|Edit media/i }).first().waitFor();
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
          const renderId = new URL(this.url, window.location.href).searchParams.get("render_id") ?? "r-visual";
          if (typeof this.onmessage === "function") {
            this.onmessage(new MessageEvent("message", {
              data: JSON.stringify({
                message: "Pre-rendering clips",
                percent: 21,
                render_id: renderId,
                stage: "cache_warm",
                type: "progress",
              }),
            }));
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

const BUG_27_ALIGNMENT = {
  ...TEST_ALIGNMENT,
  sentences: TEST_ALIGNMENT.sentences.map((sentence, index) => ({
    ...sentence,
    start_s: index * 45,
    end_s: index === TEST_ALIGNMENT.sentences.length - 1 ? 942 : (index * 45) + 40,
  })),
};

const V1_SUBTITLE_ALIGNMENT = {
  cache_hit: true,
  sentences: [{ confidence_avg: 0.97, end_s: 4, index: 1, start_s: 0, text: "Task five subtitle modal evidence." }],
  words: [],
};

const V1_SUBTITLE_PROJECT = {
  audio: "voice.wav",
  layers: [
    { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
  ],
  media: [],
  name: "Task 5 subtitle modal controls",
  output: { fps: 30, height: 1080, preset: "draft", resolution: "1080p", width: 1920 },
  subtitles: {
    burn_in: true,
    style: {
      bg_color: "#000000",
      bg_opacity: 62,
      bg_radius: 8,
      bg_style: "block",
      color: "#ffffff",
      font: "Arial",
      max_chars_per_line: 42,
      position: "bottom",
      size: 42,
    },
  },
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: V1_SUBTITLE_ALIGNMENT.sentences },
  version: 1,
  watermark: null,
};

const V1_WATERMARK_ID = "watermark-logo.png";
const V1_WATERMARK_ALIGNMENT = {
  cache_hit: true,
  sentences: [{ confidence_avg: 0.97, end_s: 4, index: 1, start_s: 0, text: "Task six watermark controls evidence." }],
  words: [],
};

const V1_WATERMARK_PROJECT = {
  audio: "voice.wav",
  layers: [],
  media: [v1MediaAsset(V1_WATERMARK_ID, V1_WATERMARK_ID, "watermark_image", "watermark")],
  name: "Task 6 watermark controls",
  output: { fps: 30, height: 1080, preset: "draft", resolution: "1080p", width: 1920 },
  subtitles: null,
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: V1_WATERMARK_ALIGNMENT.sentences },
  version: 1,
  watermark: {
    enabled: true,
    mediaId: V1_WATERMARK_ID,
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  },
};

const V1_TRANSCRIPT_ALIGNMENT = {
  cache_hit: true,
  sentences: [
    { confidence_avg: 0.96, end_s: 5, index: 1, start_s: 0, text: "Opening line for transcript editing." },
    { confidence_avg: 0.94, end_s: 10, index: 2, start_s: 5, text: "This sentence is edited in place." },
    { confidence_avg: 0.93, end_s: 15, index: 3, start_s: 10, text: "The following row keeps the same height." },
    { confidence_avg: 0.91, end_s: 20, index: 4, start_s: 15, text: "Final evidence sentence." },
  ],
  words: [],
};

const V1_TRANSCRIPT_PROJECT = {
  audio: "voice.wav",
  layers: [],
  media: [],
  name: "Task 7 transcript edit",
  output: { fps: 30, height: 1080, preset: "draft", resolution: "1080p", width: 1920 },
  subtitles: null,
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: V1_TRANSCRIPT_ALIGNMENT.sentences },
  version: 1,
  watermark: null,
};

const V1_BACKGROUND_ALIGNMENT = {
  cache_hit: true,
  sentences: [
    { confidence_avg: 0.96, end_s: 30, index: 1, start_s: 0, text: "Opening background range." },
    { confidence_avg: 0.95, end_s: 60, index: 2, start_s: 30, text: "Locked video background range." },
    { confidence_avg: 0.94, end_s: 90, index: 3, start_s: 60, text: "Final background range." },
  ],
  words: [],
};

const V1_BACKGROUND_MEDIA = [
  { duration: null, id: "bg-red.png", kind: "image" as const, name: "bg-red.png" },
  { duration: 4, id: "bg-video.mp4", kind: "video" as const, name: "bg-video.mp4" },
  { duration: null, id: "bg-blue.png", kind: "image" as const, name: "bg-blue.png" },
  { duration: null, id: "bg-crowded-1.png", kind: "image" as const, name: "bg-crowded-1.png" },
  {
    duration: null,
    id: "bg-extra-long-name.jpg",
    kind: "image" as const,
    name: "a-very-long-background-name-that-must-truncate-in-the-coverage-grid.jpg",
  },
  {
    duration: 5,
    id: "clip-extra-long-name.mp4",
    kind: "video" as const,
    name: "an-extremely-long-background-video-file-name-that-cannot-overflow-the-row-inputs.mp4",
  },
];

const V1_BACKGROUND_PROJECT = {
  audio: "voice.wav",
  layers: [
    { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
    {
      id: "bg-main",
      items: [{
        crossfade: 0,
        end: 90,
        id: "bg-scheduled",
        mediaIds: ["bg-red.png", "bg-video.mp4", "bg-blue.png"],
        motion: { easing: "linear", kind: "none" },
        schedule: [
          { end: 30, id: "seg-bg-red.png", lockedDuration: false, mediaId: "bg-red.png", start: 0 },
          { end: 34, id: "seg-bg-video.mp4", lockedDuration: true, mediaId: "bg-video.mp4", start: 30 },
          { end: 90, id: "seg-bg-blue.png", lockedDuration: false, mediaId: "bg-blue.png", start: 34 },
        ],
        sentences: [1, 3] as [number, number],
        start: 0,
        transitions: { in: "cut", out: "cut" },
      }],
      kind: "bg",
      name: "Background",
    },
  ],
  media: V1_BACKGROUND_MEDIA.map((asset) => v1MediaAsset(asset.id, asset.name, asset.kind, "background", asset.duration)),
  name: "Task 10 scheduled editor",
  output: { fps: 30, height: 1080, preset: "draft", resolution: "1080p", width: 1920 },
  subtitles: null,
  transcript: { kind: "plain_text", path: "transcript.txt", sentences: V1_BACKGROUND_ALIGNMENT.sentences },
  version: 1,
  watermark: null,
};

function v1MediaAsset(
  id: string,
  name: string,
  kind: "image" | "video" | "watermark_image",
  role: "background" | "watermark",
  duration: number | null = null,
) {
  return {
    created_at: "2026-06-03T00:00:00.000Z",
    dimensions: { height: 1080, width: 1920 },
    duration,
    hash: `hash-${id}`,
    id,
    import_mode: "copy",
    imported_at: "2026-06-03T00:00:00.000Z",
    kind,
    name,
    path: `media/${id}`,
    role,
    size: kind === "video" ? 4_800_000 : 800_000,
    thumb_path: `uploads/thumb/${id}.svg`,
  };
}

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

const BUG_EVIDENCE_PROJECT = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.map((layer) => {
    if (layer.kind === "bg") {
      return {
        ...layer,
        items: layer.items.map((item) => ({
          ...item,
          end: 128,
          mediaId: "neon-lights.jpg",
          mediaIds: ["neon-lights.jpg", "ramen-shop.jpg"],
        })),
      };
    }
    if (layer.id === "L-fg-1") {
      return { ...layer, items: layer.items.filter((item) => item.id !== "fg-004") };
    }
    return layer;
  }),
  media: [
    ...TEST_PROJECT.media.map((entry) => {
      const role =
        entry.id === "neon-lights.jpg" || entry.id === "ramen-shop.jpg" || entry.id === "yamanote-line.mp4"
          ? "background"
          : entry.id === "tokyo-skyline.jpg" || entry.id === "station-intro.mp4"
            ? "foreground"
            : "pip";
      return { ...entry, role };
    }),
    {
      created_at: "2026-05-11T00:00:00Z",
      dimensions: { height: 512, width: 512 },
      duration: null,
      hash: "hash-watermark",
      id: "qr-watermark.png",
      import_mode: "copy",
      imported_at: "2026-05-11T00:00:00Z",
      kind: "watermark_image",
      name: "qr-watermark.png",
      path: "media/qr-watermark.png",
      role: "watermark",
      size: 120000,
      thumb_path: "uploads/thumb/qr-watermark.png",
    },
  ],
  watermark: {
    mediaId: "qr-watermark.png",
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  },
};

const BUG_EVIDENCE_VIDEO_BACKGROUND_PROJECT = {
  ...BUG_EVIDENCE_PROJECT,
  layers: BUG_EVIDENCE_PROJECT.layers.map((layer) => {
    if (layer.kind !== "bg") return layer;
    return {
      ...layer,
      items: layer.items.map((item) => ({
        ...item,
        crossfade: 0,
        end: 120,
        mediaId: "yamanote-line.mp4",
        mediaIds: ["yamanote-line.mp4"],
        transitions: { in: "cut", out: "cut" },
      })),
    };
  }),
};

const BUG_2026_06_01_PROJECT = {
  ...BUG_EVIDENCE_PROJECT,
  layers: BUG_EVIDENCE_PROJECT.layers.map((layer) => {
    if (layer.kind === "bg") {
      return {
        ...layer,
        items: layer.items.map((item) => ({
          ...item,
          crossfade: 0.5,
          end: 12,
          mediaId: undefined,
          mediaIds: ["upload-video-bg-1", "upload-video-bg-2"],
          start: 0,
          transitions: { in: "cut", out: "cut" },
        })),
      };
    }
    if (layer.id === "L-fg-1") {
      return {
        ...layer,
        items: [
          ...layer.items,
          {
            cache_status: "warm",
            end: 47.2,
            id: "fg-uploaded",
            mediaId: "upload-foreground-1",
            motion: { easing: "ease_in_out", kind: "none" },
            sentences: [6, 7] as [number, number],
            start: 33.5,
            transitions: { in: "fade", out: "cut" },
          },
        ],
      };
    }
    return layer;
  }),
  media: [
    ...BUG_EVIDENCE_PROJECT.media,
    uploadedEvidenceAsset("upload-watermark-1", "uploaded-watermark.png", "watermark_image", "watermark"),
    uploadedEvidenceAsset("upload-video-bg-1", "uploaded-video-a.mp4", "video", "background", 5),
    uploadedEvidenceAsset("upload-video-bg-2", "uploaded-video-b.mp4", "video", "background", 5),
    uploadedEvidenceAsset("upload-foreground-1", "uploaded-foreground.png", "image", "foreground"),
    uploadedEvidenceAsset("upload-pip-1", "uploaded-pip.png", "image", "pip"),
  ],
  watermark: {
    mediaId: "upload-watermark-1",
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  },
};

const BUG_27_PROJECT = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.map((layer) => (
    layer.kind === "pip" || layer.kind === "fg"
      ? { ...layer, items: layer.items.map((item) => ({ ...item, anchor: "time" as const })) }
      : layer
  )),
};

function uploadedEvidenceAsset(
  id: string,
  name: string,
  kind: "image" | "video" | "watermark_image",
  role: "background" | "foreground" | "pip" | "watermark",
  duration: number | null = null,
) {
  const image = kind !== "video";
  return {
    created_at: null,
    dimensions: image ? { height: 1080, width: 1920 } : { height: 1080, width: 1920 },
    duration,
    hash: `hash-${id}`,
    id,
    import_mode: "copy",
    imported_at: "2026-06-01T00:00:00Z",
    kind,
    name,
    path: `uploads/${name}`,
    role,
    size: image ? 800000 : 4800000,
    thumb_path: `uploads/.thumbs/${name.replace(/\.[^.]+$/, ".jpg")}`,
  };
}

async function setReferencePlayback(page: Page): Promise<void> {
  await setPlaybackTime(page, DEFAULT_SCENE_SEEK_SECONDS);
}

async function setPlaybackTime(page: Page, targetTime: number): Promise<void> {
  await page.evaluate((time) => {
    const audio = document.querySelector("[data-testid='editor-audio']") as HTMLAudioElement | null;
    if (!audio) return;
    try {
      audio.currentTime = time;
      audio.dispatchEvent(new Event("timeupdate"));
    } catch {
      // Ignore audio seek errors in test mode.
    }
  }, targetTime);
}

async function seekEvidenceTimeline(page: Page, targetTime: number, duration = 942): Promise<void> {
  const waveformButton = page.getByTestId("timeline-waveform").locator("xpath=ancestor::button[1]");
  await waveformButton.waitFor({ state: "visible" });
  const box = await waveformButton.boundingBox();
  if (!box) throw new Error("Timeline waveform was not available for evidence seek.");
  const ratio = Math.max(0, Math.min(1, targetTime / Math.max(duration, 1)));
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

async function captureEvidence(target: Page | Locator, filename: string): Promise<void> {
  await fs.mkdir(BUG_EVIDENCE_DIR, { recursive: true });
  const outputPath = path.join(BUG_EVIDENCE_DIR, filename);
  if (isLocator(target)) {
    await target.waitFor({ state: "visible" });
    await target.screenshot({ path: outputPath });
    return;
  }
  await target.screenshot({ path: outputPath });
}

async function captureBugSweepEvidence(target: Page | Locator, feature: string, targetViewport: BugSweepViewport): Promise<void> {
  await fs.mkdir(V1_1_BUG_SWEEP_EVIDENCE_DIR, { recursive: true });
  const outputPath = path.join(V1_1_BUG_SWEEP_EVIDENCE_DIR, `${feature}-${targetViewport.name}.png`);
  if (isLocator(target)) {
    await target.waitFor({ state: "visible" });
    await target.screenshot({ path: outputPath });
    return;
  }
  await target.screenshot({ path: outputPath });
}

async function expectRowsStayInsideCoverageGrid(modal: Locator, mediaIds: string[]): Promise<void> {
  for (const mediaId of mediaIds) {
    const row = modal.getByTestId(`background-coverage-row-${mediaId}`);
    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    const inputs = await row.locator("input").all();
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      const inputBox = await input.boundingBox();
      expect(inputBox).not.toBeNull();
      expect((inputBox?.x ?? 0) + (inputBox?.width ?? 0)).toBeLessThanOrEqual((rowBox?.x ?? 0) + (rowBox?.width ?? 0) + 1);
    }
  }
}

async function pointerDrag(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const sourceX = (sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2;
  const sourceY = (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2;
  const targetX = (targetBox?.x ?? 0) + (targetBox?.width ?? 0) / 2;
  const targetY = (targetBox?.y ?? 0) + (targetBox?.height ?? 0) / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

async function instrumentPreviewVideoDrawing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get() {
        return 1920;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get() {
        return 1080;
      },
    });
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function drawImageWithTestVideo(
      this: CanvasRenderingContext2D,
      source: CanvasImageSource,
      ...args: number[]
    ) {
      if (source instanceof HTMLVideoElement) {
        const destination = args.length >= 8
          ? args.slice(4, 8)
          : args.length >= 4
            ? args.slice(0, 4)
            : [0, 0, this.canvas.width, this.canvas.height];
        const [x = 0, y = 0, width = this.canvas.width, height = this.canvas.height] = destination;
        const src = source.currentSrc || source.src;
        const hue = src.includes("uploaded-video-b") ? 195 : 35;
        const lightness = 32 + Math.round((source.currentTime % 5) * 7);
        this.save();
        this.fillStyle = `hsl(${hue} 72% ${lightness}%)`;
        this.fillRect(x, y, width, height);
        this.restore();
        return;
      }
      return Reflect.apply(originalDrawImage, this, [source, ...args]);
    };
  });
}

async function waitForPreviewMetadata(
  page: Page,
  expected: { drawOrderIncludes?: string; hasBackground?: "false" | "true" },
): Promise<void> {
  if (expected.hasBackground !== undefined) {
    await expect
      .poll(
        async () => page.getByTestId("preview-canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).dataset.hasBackground),
        { timeout: 10_000 },
      )
      .toBe(expected.hasBackground);
  }
  if (expected.drawOrderIncludes !== undefined) {
    await expect
      .poll(
        async () => page.getByTestId("preview-canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).dataset.drawOrder ?? ""),
        { timeout: 10_000 },
      )
      .toContain(expected.drawOrderIncludes);
  }
}

async function expectPreviewNonBlack(page: Page): Promise<void> {
  await expect
    .poll(async () => (await previewCanvasStats(page)).nonBlackRatio, { timeout: 10_000 })
    .toBeGreaterThan(0.12);
}

async function expectPreviewMostlyBlack(page: Page): Promise<void> {
  await expect
    .poll(async () => (await previewCanvasStats(page)).averageLuminance, { timeout: 10_000 })
    .toBeLessThan(24);
}

async function previewCanvasStats(page: Page): Promise<{ averageLuminance: number; nonBlackRatio: number }> {
  return page.getByTestId("preview-canvas").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context || canvas.width <= 0 || canvas.height <= 0) {
      return { averageLuminance: 0, nonBlackRatio: 0 };
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const stepX = Math.max(1, Math.floor(canvas.width / 36));
    const stepY = Math.max(1, Math.floor(canvas.height / 20));
    let luminance = 0;
    let nonBlack = 0;
    let count = 0;
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const index = (y * canvas.width + x) * 4;
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;
        const pixelLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        luminance += pixelLuminance;
        if (pixelLuminance > 8) nonBlack += 1;
        count += 1;
      }
    }
    return {
      averageLuminance: count > 0 ? luminance / count : 0,
      nonBlackRatio: count > 0 ? nonBlack / count : 0,
    };
  });
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
  if (filename.includes("bg-red")) return ["#d45136", "#d45136"];
  if (filename.includes("bg-video")) return ["#202020", "#202020"];
  if (filename.includes("bg-blue")) return ["#2b6fd6", "#2b6fd6"];
  if (filename.includes("bg-crowded")) return ["#2f9e61", "#2f9e61"];
  if (filename.includes("bg-extra-long-name")) return ["#8d5cc8", "#8d5cc8"];
  if (filename.includes("clip-extra-long-name")) return ["#a9712f", "#a9712f"];
  if (filename.includes("watermark-logo")) return ["#ffcc00", "#ffcc00"];
  if (filename.includes("callout-map")) return ["#0f4f6f", "#126487"];
  if (filename.includes("quote-card")) return ["#6a5032", "#826239"];
  if (filename.includes("crowd-cross")) return ["#5a2b2b", "#7a3f35"];
  if (filename.includes("neon-lights")) return ["#6b2a58", "#8f3f4a"];
  if (filename.includes("yamanote-line")) return ["#2f6a56", "#3a7a72"];
  if (filename.includes("ramen-shop")) return ["#7f3a1f", "#9e5b35"];
  if (filename.includes("station-intro")) return ["#695f5b", "#9a7f64"];
  return ["#454275", "#855037"];
}
