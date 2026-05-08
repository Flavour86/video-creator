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

    expect(globalsCss).toContain("--type-display-size: 32px;");
    expect(globalsCss).toContain("--type-h2-size: 24px;");
    expect(globalsCss).toContain("--type-section-size: 16px;");
    expect(globalsCss).toContain("font-size: var(--type-display-size);");
    expect(globalsCss).toContain("font-size: var(--type-mono-meta-size);");
    expect(globalsCss).not.toMatch(/tracking-\[-/);
    expect(globalsCss).not.toMatch(/tracking-\[[^\]]+em\]/);
    expect(globalsCss.match(/letter-spacing: 0;/g)?.length).toBeGreaterThanOrEqual(8);
    expect(globalsCss).toContain("font-family: var(--font-mono);");
    expect(globalsCss).toContain("color: var(--text);");
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

  test("defines elevation tokens and shared elevation conventions", () => {
    expect(globalsCss).toContain(
      "--shadow-1: 0 1px 0 oklch(1 0 0 / 0.04) inset, 0 1px 2px oklch(0 0 0 / 0.4);",
    );
    expect(globalsCss).toContain("--shadow-2: 0 14px 40px oklch(0 0 0 / 0.5);");
    expect(globalsCss).toContain(".vc-elevation-inline");
    expect(globalsCss).toContain("box-shadow: none;");
    expect(globalsCss).toContain("border-color: var(--line-soft);");
    expect(globalsCss).toContain(".vc-elevation-raised");
    expect(globalsCss).toContain("box-shadow: var(--shadow-1);");
    expect(globalsCss).toContain(".vc-elevation-overlay");
    expect(globalsCss).toContain("box-shadow: var(--shadow-2);");
  });

  test("defines cinema tokens for preview and render surfaces", () => {
    const cinemaTokens = new Map([
      ["--cinema-aspect-landscape", "16 / 9"],
      ["--cinema-aspect-portrait", "9 / 16"],
      ["--cinema-final-width", "1920px"],
      ["--cinema-final-height", "1080px"],
      ["--cinema-final-fps", "30"],
      ["--cinema-final-range", "sdr"],
      ["--cinema-final-color-space", "bt709"],
      ["--cinema-draft-width", "1280px"],
      ["--cinema-draft-height", "720px"],
      ["--cinema-draft-fps", "30"],
      ["--cinema-preview-fit", "contain"],
      ["--cinema-subtitle-safe-x", "8%"],
      ["--cinema-subtitle-safe-y", "10%"],
      ["--cinema-watermark-safe-x", "5%"],
      ["--cinema-watermark-safe-y", "5%"],
      ["--cinema-pip-inset-x", "4%"],
      ["--cinema-pip-inset-y", "4%"],
      ["--cinema-pip-min-scale", "0.22"],
      ["--cinema-pip-max-scale", "0.36"],
      ["--cinema-timeline-track-height", "28px"],
      ["--cinema-timeline-layer-height", "36px"],
      ["--cinema-playhead-width", "2px"],
      ["--cinema-clip-radius", "var(--r)"],
    ]);

    for (const [token, value] of cinemaTokens) {
      expect(globalsCss).toContain(`${token}: ${value};`);
    }

    expect(globalsCss).toContain(".vc-cinema-landscape");
    expect(globalsCss).toContain("aspect-ratio: var(--cinema-aspect-landscape);");
    expect(globalsCss).toContain(".vc-cinema-portrait");
    expect(globalsCss).toContain("aspect-ratio: var(--cinema-aspect-portrait);");
  });

  test("defines shared drag and drop visual states", () => {
    expect(globalsCss).toContain(".vc-drop-zone");
    expect(globalsCss).toContain('.vc-drop-zone[data-state="active"]');
    expect(globalsCss).toContain('.vc-drop-zone[data-state="invalid"]');
    expect(globalsCss).toContain("border-color: var(--amber);");
    expect(globalsCss).toContain("border-color: var(--red);");
  });
});
