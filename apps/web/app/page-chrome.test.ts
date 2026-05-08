import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const routeFiles = [
  "page.tsx",
  "setup/page.tsx",
  "render/page.tsx",
  "projects/new/page.tsx",
  "tokens/page.tsx",
  "editor/page.tsx",
] as const;

describe("route page chrome", () => {
  test.each(routeFiles)("%s uses shared full-canvas page chrome", (routeFile) => {
    const source = readFileSync(join(process.cwd(), "app", routeFile), "utf8");

    expect(source).toContain("PageChrome");
    expect(source).not.toMatch(/<main\s+className="[^"]*(mx-auto|max-w-5xl|max-w-xl|min-h-screen)/);
  });
});
