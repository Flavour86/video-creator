import { test, type Page } from "@playwright/test";
import type { SetupAlignment, SetupDraft, SetupSubtitleGenerationResult } from "@vc/shared-schemas";

import {
  compareScreenshots,
  cropActualToReference,
  visualActualPath,
  visualReferencePath,
} from "./visual-test-utils";

const SETUP_VIEWPORT = { width: 1330, height: 899 };
const SETUP_DEVICE_SCALE_FACTOR = 1.5;
const SETUP_SSIM_THRESHOLD = 0.9;

type Theme = "dark" | "light";
type SetupVisualState =
  | "complete"
  | "srt-ready"
  | "srt-running"
  | "srt-failed"
  | "alignment-ready"
  | "alignment-selected"
  | "alignment-running"
  | "alignment-success";

const SETUP_CASES: Array<{ reference: string; state: SetupVisualState; theme: Theme }> = [
  { reference: "Setup-dark.png", state: "complete", theme: "dark" },
  { reference: "Setup-light.png", state: "complete", theme: "light" },
  { reference: "Setup-dark-srt.png", state: "srt-ready", theme: "dark" },
  { reference: "Setup-dark-srt-running.png", state: "srt-running", theme: "dark" },
  { reference: "Setup-dark-srt-failed.png", state: "srt-failed", theme: "dark" },
  { reference: "Setup-dark-alignment.png", state: "alignment-ready", theme: "dark" },
  { reference: "Setup-dark-alignment-selected.png", state: "alignment-selected", theme: "dark" },
  { reference: "Setup-dark-alignment-running.png", state: "alignment-running", theme: "dark" },
  { reference: "Setup-dark-alignment-success.png", state: "alignment-success", theme: "dark" },
];

test.describe("setup visual parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: SETUP_DEVICE_SCALE_FACTOR, viewport: SETUP_VIEWPORT });

  for (const visualCase of SETUP_CASES) {
    test(`${visualCase.reference} parity`, async ({ page }) => {
      await compareSetup(page, visualCase);
    });
  }
});

async function compareSetup(
  page: Page,
  visualCase: { reference: string; state: SetupVisualState; theme: Theme },
) {
  await prepareVisualPage(page, visualCase.theme);
  await routeSetupDraft(page, draftForState(visualCase.state));
  await page.goto("/setup", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "SetUp" }).waitFor();
  await settleChrome(page);

  const referencePath = await visualReferencePath(visualCase.reference);
  const actualPath = await visualActualPath(visualCase.reference.replace(".png", ".actual.png"));
  await page.screenshot({ path: actualPath });
  await cropActualToReference(actualPath, referencePath);
  await compareScreenshots({
    actualPath,
    referencePath,
    stateName: visualCase.reference,
    threshold: SETUP_SSIM_THRESHOLD,
  });
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

async function routeSetupDraft(page: Page, draft: SetupDraft) {
  await page.route("**/api/server/setup/drafts", async (route) => {
    await route.fulfill({ json: { setup_id: "setup_visual", draft } });
  });
}

async function settleChrome(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
  });
  await page.waitForTimeout(250);
}

function draftForState(state: SetupVisualState): SetupDraft {
  const withTranscript = state === "complete"
    || state === "alignment-selected"
    || state === "alignment-running"
    || state === "alignment-success";
  const subtitle = subtitleForState(state);
  const alignment = alignmentForState(state);
  return {
    project_id: undefined,
    path: "E:/video-projects/tokyo-essay",
    name: "Tokyo Essay",
    output_preset: "final",
    voice: {
        path: "Soon Subway (Minjiang Century City Linjiangyuan Shop).m4a",
        duration: 942,
        sample_rate: 48000,
        channels: 2,
        codec: "aac",
        state: "copied",
    },
    transcript: withTranscript
      ? {
        path: "transcript.txt",
        sentence_count: 21,
        state: "parsed",
      }
      : null,
    subtitle_generation: subtitle,
    alignment,
  };
}

function subtitleForState(state: SetupVisualState): SetupSubtitleGenerationResult {
  if (state === "srt-running") {
    return {
      status: "running",
      cue_count: 0,
      total_duration_s: 0,
      cache_state: "unknown",
      error_message: null,
    };
  }
  if (state === "srt-failed") {
    return {
      status: "failed",
      cue_count: 0,
      total_duration_s: 0,
      cache_state: "unknown",
      error_message: "Transcript is empty.",
    };
  }
  if (state === "srt-ready") {
    return {
      status: "ready",
      cue_count: 0,
      total_duration_s: 0,
      cache_state: "unknown",
      error_message: null,
    };
  }
  return {
    status: "succeeded",
    cue_count: 21,
    total_duration_s: 942,
    cache_state: "miss",
    error_message: null,
  };
}

function alignmentForState(state: SetupVisualState): SetupAlignment {
  const base = {
    hash: "8a3f2c1df91c",
    device: "cuda fp16",
    model: "large-v3",
    audio_duration: 942,
    cache_hit: false,
  };
  if (state === "alignment-running") {
    return { ...base, status: "running" };
  }
  if (state === "alignment-success" || state === "complete") {
    return { ...base, status: "aligned", cache_hit: true };
  }
  if (state === "alignment-selected") {
    return { ...base, status: "pending" };
  }
  return state === "srt-failed"
    ? { ...base, status: "failed", error: "Subtitle generation failed." }
    : { ...base, status: "pending" };
}
