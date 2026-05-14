import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { compareScreenshots, DEFAULT_SSIM_THRESHOLD } from "./visual-test-utils";

const SHELL_VIEWPORT = { width: 1495, height: 971 };
const SHELL_DEVICE_SCALE_FACTOR = 1.5;
const SHELL_REFERENCE_SIZE = { width: 2243, height: 1456 };

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(THIS_DIR, "../../../..");
const REFERENCES_DIR = path.join(ROOT_DIR, "docs", "designs", "visuals");
const ARTIFACTS_DIR = path.join(THIS_DIR, "artifacts", "actual");

async function captureShell(page: Page, theme: "dark" | "light", outputName: string) {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  await page.addInitScript(
    ({ themeValue }) => {
      window.localStorage.setItem("vc.theme", themeValue);
      window.localStorage.setItem("vc.language", "en");
    },
    { themeValue: theme },
  );
  await page.route("**/projects", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [] });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) {
      main.replaceChildren();
      main.removeAttribute("class");
      main.setAttribute(
        "style",
        [
          "min-height: calc(100vh - 2.75rem - var(--space-10))",
          "background: var(--bg-1)",
        ].join(";"),
      );
    }

    const nextPortals = document.querySelectorAll("nextjs-portal");
    nextPortals.forEach((node) => node.remove());
  });
  await page.waitForTimeout(250);

  const actualPath = path.join(ARTIFACTS_DIR, outputName);
  await page.screenshot({ path: actualPath });
  await cropDeviceRoundingRow(actualPath);
  return actualPath;
}

async function cropDeviceRoundingRow(actualPath: string) {
  const image = PNG.sync.read(await fs.readFile(actualPath));
  if (image.width !== SHELL_REFERENCE_SIZE.width) {
    return;
  }
  if (image.height === SHELL_REFERENCE_SIZE.height) {
    return;
  }
  if (image.height !== SHELL_REFERENCE_SIZE.height + 1) {
    return;
  }

  const cropped = new PNG(SHELL_REFERENCE_SIZE);
  PNG.bitblt(image, cropped, 0, 0, image.width, SHELL_REFERENCE_SIZE.height, 0, 0);
  await fs.writeFile(actualPath, PNG.sync.write(cropped));
}

test.describe("shell parity", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ deviceScaleFactor: SHELL_DEVICE_SCALE_FACTOR, viewport: SHELL_VIEWPORT });

  test("shell-dark parity", async ({ page }) => {
    const referencePath = path.join(REFERENCES_DIR, "shell-dark.png");
    const actualPath = await captureShell(page, "dark", "shell-dark.actual.png");

    await compareScreenshots({
      referencePath,
      actualPath,
      threshold: DEFAULT_SSIM_THRESHOLD,
    });
  });

  test("shell-light parity", async ({ page }) => {
    const referencePath = path.join(REFERENCES_DIR, "shell-light.png");
    const actualPath = await captureShell(page, "light", "shell-light.actual.png");

    await compareScreenshots({
      referencePath,
      actualPath,
      threshold: DEFAULT_SSIM_THRESHOLD,
    });
  });
});
