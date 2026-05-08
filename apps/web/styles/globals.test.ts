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

  test("defines the prototype light theme values behind the light theme selector", () => {
    expect(globalsCss).toContain(':root[data-theme="light"]');
    expect(globalsCss).toContain("color-scheme: light;");
    expect(globalsCss).toContain("--bg-0: oklch(0.97 0.003 80);");
    expect(globalsCss).toContain("--bg-5: oklch(0.85 0.006 70);");
    expect(globalsCss).toContain("--text: oklch(0.2 0.01 70);");
    expect(globalsCss).toContain("--text-4: oklch(0.62 0.01 70);");
    expect(globalsCss).toContain("--line: oklch(0.88 0.005 70);");
    expect(globalsCss).toContain("--line-soft: oklch(0.92 0.004 70);");
  });

  test("defines named typography utilities for the prototype type scale", () => {
    const requiredUtilities = [
      ".vc-type-display",
      ".vc-type-h2",
      ".vc-type-section",
      ".vc-type-body",
      ".vc-type-caption",
      ".vc-type-eyebrow",
      ".vc-type-mono-timecode",
      ".vc-type-mono-meta",
    ];

    for (const utility of requiredUtilities) {
      expect(globalsCss).toContain(utility);
    }

    expect(globalsCss).toContain("text-[32px]");
    expect(globalsCss).toContain("text-2xl");
    expect(globalsCss).toContain("text-base");
    expect(globalsCss).toContain("tracking-[-0.02em]");
    expect(globalsCss).toContain("tracking-[0.06em]");
    expect(globalsCss).toContain("font-mono");
    expect(globalsCss).toContain("text-(--text)");
    expect(globalsCss).not.toMatch(/\[[^\]]*var\(--/);
  });

  test("declares a no-network Tailwind font strategy", () => {
    expect(globalsCss).toContain("@theme inline");
    expect(globalsCss).toContain('--font-sans: "Inter Tight", ui-sans-serif, system-ui, sans-serif;');
    expect(globalsCss).toContain(
      '--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;',
    );
    expect(globalsCss).toContain("font-family: var(--font-sans);");
    expect(globalsCss).not.toContain("@font-face");
    expect(globalsCss).not.toContain("url(");
  });

  test("defines the prototype spacing token scale", () => {
    const spacingTokens = new Map([
      ["--space-1", "4px"],
      ["--space-2", "6px"],
      ["--space-3", "8px"],
      ["--space-4", "10px"],
      ["--space-5", "12px"],
      ["--space-6", "14px"],
      ["--space-7", "16px"],
      ["--space-8", "20px"],
      ["--space-9", "24px"],
      ["--space-10", "32px"],
      ["--space-11", "40px"],
      ["--space-12", "56px"],
    ]);

    for (const [token, value] of spacingTokens) {
      expect(globalsCss).toContain(`${token}: ${value};`);
    }
  });

  test("defines radius tokens and shared pill conventions", () => {
    expect(globalsCss).toContain("--r-sm: 4px;");
    expect(globalsCss).toContain("--r: 6px;");
    expect(globalsCss).toContain("--r-md: 10px;");
    expect(globalsCss).toContain("--r-lg: 14px;");
    expect(globalsCss).toContain("--r-pill: 999px;");
    expect(globalsCss).toContain(".vc-radius-pill");
    expect(globalsCss).toContain(".vc-radius-circle");
    expect(globalsCss.match(/border-radius: var\(--r-pill\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
