import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const require = createRequire(path.join(repoRoot, "apps", "web", "package.json"));
const { chromium } = require("@playwright/test");
const prototypeDir = path.join(repoRoot, "docs", "prototype", "v1");
const outputDir = path.join(__dirname, "visuals");
const outputPath = path.join(outputDir, "editor-fullscreen-button-1920x1080.png");
const port = 4173;
const url = `http://127.0.0.1:${port}/app.html`;

const server = spawn("python", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", prototypeDir], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"]
});

const logs = [];
server.stdout.on("data", (chunk) => logs.push(String(chunk)));
server.stderr.on("data", (chunk) => logs.push(String(chunk)));

const waitForServer = async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Prototype server did not become ready.\n${logs.join("")}`);
};

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".proj-card").first().click();
  await page.locator(".preview-time-actions .fullscreen-btn").waitFor({ state: "visible" });
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();

  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors:\n${consoleErrors.join("\n")}`);
  }

  console.log(outputPath);
} finally {
  server.kill();
}
