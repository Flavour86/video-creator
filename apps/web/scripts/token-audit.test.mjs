import { describe, expect, test } from "vitest";

import { auditFiles, isAuditableFrontendFile } from "./token-audit.mjs";

describe("token audit", () => {
  test("allows raw values inside CSS custom property declarations", () => {
    const violations = auditFiles([
      {
        path: "apps/web/styles/globals.css",
        content: [
          ":root {",
          "  --bg-0: oklch(0.16 0.005 60);",
          "  --text-size-body: 13px;",
          "  --r: 6px;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(violations).toEqual([]);
  });

  test("flags raw visual values outside token declarations", () => {
    const violations = auditFiles([
      {
        path: "apps/web/components/example/Card.tsx",
        content: [
          '<div className="text-[#fff] rounded-[12px] text-[14px]">',
          "  <span style={{ color: 'hsl(0 0% 100%)' }}>Preview</span>",
          "</div>",
        ].join("\n"),
      },
    ]);

    expect(violations.map((violation) => violation.rule)).toEqual([
      "raw hex color",
      "raw font size",
      "raw radius",
      "raw hsl color",
    ]);
  });

  test("scopes changed-file audit to frontend implementation files", () => {
    expect(isAuditableFrontendFile("apps/web/components/ui/Button.tsx")).toBe(true);
    expect(isAuditableFrontendFile("apps/web/app/launcher/page.tsx")).toBe(true);
    expect(isAuditableFrontendFile("apps/web/styles/globals.css")).toBe(true);
    expect(isAuditableFrontendFile("apps/web/components/ui/Button.test.tsx")).toBe(false);
    expect(isAuditableFrontendFile("apps/web/scripts/token-audit.mjs")).toBe(false);
    expect(isAuditableFrontendFile("apps/server/main.py")).toBe(false);
  });
});
