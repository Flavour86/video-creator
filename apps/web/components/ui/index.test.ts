import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

describe("ui component root", () => {
  test("provides a stable barrel for shared design-system primitives", () => {
    expect(existsSync(join(__dirname, "index.ts"))).toBe(true);
  });
});
