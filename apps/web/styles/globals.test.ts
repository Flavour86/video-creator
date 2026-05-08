import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const globalsCss = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("global design tokens", () => {
  test("defines the required surface, text, line, accent, font, radius, and shadow tokens", () => {
    const requiredTokens = [
      "--bg-0",
      "--bg-1",
      "--bg-2",
      "--bg-3",
      "--bg-4",
      "--bg-5",
      "--text",
      "--text-2",
      "--text-3",
      "--text-4",
      "--line",
      "--line-soft",
      "--amber",
      "--blue",
      "--green",
      "--red",
      "--violet",
      "--font-sans",
      "--font-mono",
      "--r-sm",
      "--r",
      "--r-md",
      "--r-lg",
      "--shadow-1",
      "--shadow-2",
    ];

    for (const token of requiredTokens) {
      expect(globalsCss).toContain(`${token}:`);
    }
  });

  test("uses the dark token set as the default document theme", () => {
    expect(globalsCss).toContain("color-scheme: dark;");
    expect(globalsCss).toContain("--bg-0: oklch(0.16 0.005 60);");
    expect(globalsCss).toContain("--text: oklch(0.97 0.005 80);");
    expect(globalsCss).toContain("background: var(--bg-0);");
    expect(globalsCss).toContain("color: var(--text);");
  });
});
