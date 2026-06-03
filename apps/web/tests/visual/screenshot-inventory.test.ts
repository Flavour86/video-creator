import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EDITOR_VISUAL_SCREENSHOTS, V1_1_EDITOR_VISUAL_SCREENSHOTS } from "./editor-visual-cases";
import { RENDER_STATE_CASES, RENDER_VISUAL_SCREENSHOTS, type RenderVisualState } from "./render-visual-cases";
import { visualManifest, type VisualOwner } from "./visual-manifest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../../..");
const VISUAL_REF_PATTERN = /visuals\/([A-Za-z0-9_.-]+\.png)/g;
const V1_1_VISUAL_REF_PATTERN = /docs\/designs\/tasks\/v1\.1\/visuals\/([A-Za-z0-9_.-]+\.png)/g;

const splitSpecs = [
  { path: "docs/designs/tasks/global-frontend/SPEC_FRONTEND_GLOBAL.md", expectedOwner: "frontend-global" as VisualOwner },
  { path: "docs/designs/tasks/launcher/SPEC_LAUNCHER.md", expectedOwner: "launcher" as VisualOwner },
  { path: "docs/designs/tasks/editor/SPEC_EDITOR.md", expectedOwner: "editor" as VisualOwner },
  { path: "docs/designs/tasks/render/SPEC_RENDER.md", expectedOwner: "render" as VisualOwner },
];

function collectScreenshotRefs(specRelativePath: string): string[] {
  const specPath = path.join(REPO_ROOT, specRelativePath);
  const source = fs.readFileSync(specPath, "utf8");
  const refs = new Set<string>();

  for (const match of source.matchAll(VISUAL_REF_PATTERN)) {
    refs.add(`docs/designs/visuals/${match[1]}`);
  }

  return [...refs];
}

function collectV1_1ScreenshotRefs(): string[] {
  const specPath = path.join(REPO_ROOT, "docs/designs/tasks/v1.1/spec.md");
  const source = fs.readFileSync(specPath, "utf8");
  const refs = new Set<string>();

  for (const match of source.matchAll(V1_1_VISUAL_REF_PATTERN)) {
    refs.add(`docs/designs/tasks/v1.1/visuals/${match[1]}`);
  }

  return [...refs];
}

function v1_1VisualReferenceWindows(): string[] {
  const specPath = path.join(REPO_ROOT, "docs/designs/tasks/v1.1/spec.md");
  const lines = fs.readFileSync(specPath, "utf8").split("\n");
  const windows: string[] = [];
  lines.forEach((line, index) => {
    if (V1_1_VISUAL_REF_PATTERN.test(line)) {
      windows.push(lines.slice(index, index + 6).join("\n"));
    }
    V1_1_VISUAL_REF_PATTERN.lastIndex = 0;
  });
  return windows;
}

function entriesByScreenshot() {
  const entries = new Map<string, typeof visualManifest>();
  for (const entry of visualManifest) {
    entries.set(entry.screenshot, [...(entries.get(entry.screenshot) ?? []), entry]);
  }
  return entries;
}

function findDuplicates(items: ReadonlyArray<string>): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([item]) => item);
}

describe("split-spec screenshot ownership inventory", () => {
  it("declares exactly one owner for every split-spec visuals reference", () => {
    const expected = new Set<string>();
    for (const spec of splitSpecs) {
      for (const screenshot of collectScreenshotRefs(spec.path)) {
        expected.add(screenshot);
      }
    }

    const byScreenshot = entriesByScreenshot();
    const declared = new Set([...byScreenshot.keys()].filter((screenshot) => screenshot.startsWith("docs/designs/visuals/")));

    const missing = [...expected].filter((item) => !declared.has(item));
    const extra = [...declared].filter((item) => !expected.has(item));
    const duplicates = [...byScreenshot]
      .filter(([, entries]) => entries.length !== 1)
      .map(([screenshot, entries]) => `${screenshot} (${entries.length})`);

    expect(
      { duplicates, extra, missing },
      [
        "Screenshot inventory mismatch.",
        `Missing declarations: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Undeclared references: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicate declarations: ${duplicates.length ? duplicates.join(", ") : "(none)"}`,
      ].join("\n"),
    ).toEqual({ duplicates: [], extra: [], missing: [] });
  });

  it("keeps frontend-global ownership limited to shell screenshots", () => {
    const frontendGlobalOwned = visualManifest
      .filter((entry) => entry.owner === "frontend-global")
      .map((entry) => entry.screenshot)
      .sort();

    expect(frontendGlobalOwned).toEqual([
      "docs/designs/visuals/shell-dark.png",
      "docs/designs/visuals/shell-light.png",
    ]);
  });

  it("makes module ownership explicit by split-spec family", () => {
    const problems: string[] = [];

    for (const spec of splitSpecs) {
      for (const screenshot of collectScreenshotRefs(spec.path)) {
        const declared = visualManifest.find((entry) => entry.screenshot === screenshot);
        if (!declared) {
          continue;
        }
        if (declared.owner !== spec.expectedOwner) {
          problems.push(`${screenshot} expected=${spec.expectedOwner} actual=${declared.owner}`);
        }
      }
    }

    expect(problems, `Ownership mismatches:\n${problems.join("\n")}`).toEqual([]);
  });

  it("keeps launcher/setup parity screenshots implemented under launcher ownership", () => {
    const launcherSpecRefs = collectScreenshotRefs("docs/designs/tasks/launcher/SPEC_LAUNCHER.md");
    const launcherVisualRefs = launcherSpecRefs.filter(
      (screenshot) => screenshot.includes("/Launcher-") || screenshot.includes("/Setup-"),
    );

    const problems: string[] = [];
    for (const screenshot of launcherVisualRefs) {
      const entries = visualManifest.filter((entry) => entry.screenshot === screenshot);
      if (entries.length !== 1) {
        problems.push(`${screenshot} expected exactly one manifest entry, got ${entries.length}`);
        continue;
      }
      const [entry] = entries;
      if (entry && (entry.owner !== "launcher" || entry.status !== "implemented")) {
        problems.push(
          `${screenshot} expected owner=launcher/status=implemented actual owner=${entry.owner}/status=${entry.status}`,
        );
      }
    }

    expect(problems, `Launcher visual parity ownership mismatches:\n${problems.join("\n")}`).toEqual([]);
  });

  it("keeps editor parity screenshots implemented under editor ownership", () => {
    const editorRefs = collectScreenshotRefs("docs/designs/tasks/editor/SPEC_EDITOR.md");
    const problems: string[] = [];

    for (const screenshot of editorRefs) {
      const entries = visualManifest.filter((entry) => entry.screenshot === screenshot);
      if (entries.length !== 1) {
        problems.push(`${screenshot} expected exactly one manifest entry, got ${entries.length}`);
        continue;
      }
      const [entry] = entries;
      if (entry && (entry.owner !== "editor" || entry.status !== "implemented")) {
        problems.push(
          `${screenshot} expected owner=editor/status=implemented actual owner=${entry.owner}/status=${entry.status}`,
        );
      }
    }

    expect(problems, `Editor visual parity ownership mismatches:\n${problems.join("\n")}`).toEqual([]);
  });

  it("maps every editor screenshot reference to exactly one visual parity case", () => {
    const editorRefs = new Set(collectScreenshotRefs("docs/designs/tasks/editor/SPEC_EDITOR.md"));
    const visualCaseRefs = [...EDITOR_VISUAL_SCREENSHOTS];
    const uniqueVisualCaseRefs = [...new Set(visualCaseRefs)].sort();

    const missing = [...editorRefs].filter((screenshot) => !uniqueVisualCaseRefs.includes(screenshot));
    const extra = uniqueVisualCaseRefs.filter((screenshot) => !editorRefs.has(screenshot));
    const duplicates = findDuplicates(visualCaseRefs);

    expect(
      { duplicates, extra, missing },
      [
        "Editor visual test mapping mismatch.",
        `Missing visual parity tests: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Extra visual parity tests: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicate visual parity tests: ${duplicates.length ? duplicates.join(", ") : "(none)"}`,
      ].join("\n"),
    ).toEqual({ duplicates: [], extra: [], missing: [] });
  });

  it("declares v1.1 canonical visual references under editor ownership", () => {
    const expected = collectV1_1ScreenshotRefs();
    const problems: string[] = [];

    for (const screenshot of expected) {
      const entries = visualManifest.filter((entry) => entry.screenshot === screenshot);
      if (entries.length !== 1) {
        problems.push(`${screenshot} expected exactly one manifest entry, got ${entries.length}`);
        continue;
      }
      const [entry] = entries;
      if (entry && (entry.owner !== "editor" || entry.status !== "implemented")) {
        problems.push(
          `${screenshot} expected owner=editor/status=implemented actual owner=${entry.owner}/status=${entry.status}`,
        );
      }
    }

    expect(problems, `v1.1 visual parity ownership mismatches:\n${problems.join("\n")}`).toEqual([]);
  });

  it("maps every v1.1 editor screenshot reference to exactly one visual parity case", () => {
    const v1_1Refs = new Set(collectV1_1ScreenshotRefs());
    const visualCaseRefs = [...V1_1_EDITOR_VISUAL_SCREENSHOTS];
    const uniqueVisualCaseRefs = [...new Set(visualCaseRefs)].sort();

    const missing = [...v1_1Refs].filter((screenshot) => !uniqueVisualCaseRefs.includes(screenshot));
    const extra = uniqueVisualCaseRefs.filter((screenshot) => !v1_1Refs.has(screenshot));
    const duplicates = findDuplicates(visualCaseRefs);

    expect(
      { duplicates, extra, missing },
      [
        "v1.1 visual test mapping mismatch.",
        `Missing visual parity tests: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Extra visual parity tests: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicate visual parity tests: ${duplicates.length ? duplicates.join(", ") : "(none)"}`,
      ].join("\n"),
    ).toEqual({ duplicates: [], extra: [], missing: [] });
  });

  it("keeps v1.1 dynamic visual tolerances documented beside canonical references", () => {
    const windows = v1_1VisualReferenceWindows();
    const problems = windows.filter((window) => !window.includes("SSIM target:")).map((window) => window.split("\n")[0] ?? "(unknown reference)");

    expect(problems, `v1.1 visual sections missing SSIM target notes:\n${problems.join("\n")}`).toEqual([]);
    expect(windows.join("\n")).toMatch(/Dynamic|may differ|small tolerance/i);
  });

  it("keeps render parity screenshots implemented under render ownership", () => {
    const renderRefs = collectScreenshotRefs("docs/designs/tasks/render/SPEC_RENDER.md");
    const problems: string[] = [];

    for (const screenshot of renderRefs) {
      const entries = visualManifest.filter((entry) => entry.screenshot === screenshot);
      if (entries.length !== 1) {
        problems.push(`${screenshot} expected exactly one manifest entry, got ${entries.length}`);
        continue;
      }
      const [entry] = entries;
      if (entry && (entry.owner !== "render" || entry.status !== "implemented")) {
        problems.push(
          `${screenshot} expected owner=render/status=implemented actual owner=${entry.owner}/status=${entry.status}`,
        );
      }
    }

    expect(problems, `Render visual parity ownership mismatches:\n${problems.join("\n")}`).toEqual([]);
  });

  it("maps every render screenshot reference to exactly one visual parity case", () => {
    const renderRefs = new Set(collectScreenshotRefs("docs/designs/tasks/render/SPEC_RENDER.md"));
    const visualCaseRefs = [...RENDER_VISUAL_SCREENSHOTS];
    const uniqueVisualCaseRefs = [...new Set(visualCaseRefs)].sort();

    const missing = [...renderRefs].filter((screenshot) => !uniqueVisualCaseRefs.includes(screenshot));
    const extra = uniqueVisualCaseRefs.filter((screenshot) => !renderRefs.has(screenshot));
    const duplicates = findDuplicates(visualCaseRefs);

    expect(
      { duplicates, extra, missing },
      [
        "Render visual test mapping mismatch.",
        `Missing visual parity tests: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Extra visual parity tests: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicate visual parity tests: ${duplicates.length ? duplicates.join(", ") : "(none)"}`,
      ].join("\n"),
    ).toEqual({ duplicates: [], extra: [], missing: [] });
  });

  it("covers the required render fixture states", () => {
    const requiredStates: RenderVisualState[] = [
      "idle",
      "queued",
      "verifying",
      "prerender",
      "subtitles",
      "composing",
      "muxing",
      "loggingHistory",
      "done",
      "cancelling",
      "cancelled",
      "failed",
      "outputMissing",
      "partialExcluded",
      "ffmpegWarning",
      "ffmpegFatalError",
      "historyEmpty",
      "afterRenderActions",
    ];
    const covered = RENDER_STATE_CASES.map((stateCase) => stateCase.state);

    const missing = requiredStates.filter((state) => !covered.includes(state));
    const extra = covered.filter((state) => !requiredStates.includes(state));
    const duplicates = findDuplicates(covered);

    expect(
      { duplicates, extra, missing },
      [
        "Render visual state coverage mismatch.",
        `Missing states: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Extra states: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicate states: ${duplicates.length ? duplicates.join(", ") : "(none)"}`,
      ].join("\n"),
    ).toEqual({ duplicates: [], extra: [], missing: [] });
  });
});
