import { defineConfig } from "@playwright/test";

const E2E_PORT = Number(process.env.E2E_PORT ?? "3200");
const E2E_BASE_URL = process.env.E2E_BASE_URL?.trim();
const baseURL = E2E_BASE_URL || `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "tests/e2e/artifacts/test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start --port ${E2E_PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 300_000,
      },
});
