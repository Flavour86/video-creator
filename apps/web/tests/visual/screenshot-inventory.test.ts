import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { visualManifest, type VisualOwner } from "./visual-manifest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../../..");
const VISUAL_REF_PATTERN = /visuals\/([A-Za-z0-9_.-]+\.png)/g;

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

function entriesByScreenshot() {
  const entries = new Map<string, typeof visualManifest>();
  for (const entry of visualManifest) {
    entries.set(entry.screenshot, [...(entries.get(entry.screenshot) ?? []), entry]);
  }
  return entries;
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
    const declared = new Set(byScreenshot.keys());

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
});
