import { describe, expect, test } from "vitest";

import { dictionaries } from "./messages";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("i18n dictionaries", () => {
  test("defines English and Chinese dictionaries with matching key paths", () => {
    expect(Object.keys(dictionaries)).toEqual(["en", "zh"]);
    expect(flattenKeys(dictionaries.zh)).toEqual(flattenKeys(dictionaries.en));
  });

  test("covers the global shell and shared control vocabulary", () => {
    expect(dictionaries.en.appShell.brand.productName).toBe("Video Creator");
    expect(dictionaries.en.appShell.nav).toMatchObject({
      editor: "Editor",
      launcher: "Launcher",
      render: "Render",
      setup: "Setup",
      tokens: "Tokens",
    });
    expect(dictionaries.en.globalControls.buttons.openFolder).toBe("Open folder");
    expect(dictionaries.en.globalControls.tooltips.toggleTheme).toBe("Toggle theme");
  });

  test("covers validation, empty states, status labels, and page labels", () => {
    expect(dictionaries.en.validation.folderMissing).toBe("Folder missing");
    expect(dictionaries.en.emptyStates.noProjectOpen).toContain("No project open");
    expect(dictionaries.en.status.ready).toBe("Ready");
    expect(dictionaries.en.pages.tokens.sections.cinema).toBe("Cinema");
  });
});
