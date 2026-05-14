import { defineConfig } from "@playwright/test";

const VISUAL_PORT = Number(process.env.VISUAL_PORT ?? "3100");
const VISUAL_BASE_URL = process.env.VISUAL_BASE_URL?.trim();
const baseURL = VISUAL_BASE_URL || `http://127.0.0.1:${VISUAL_PORT}`;

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "list",
  outputDir: "tests/visual/artifacts/test-results",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
  },
  webServer: VISUAL_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next dev --port ${VISUAL_PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
