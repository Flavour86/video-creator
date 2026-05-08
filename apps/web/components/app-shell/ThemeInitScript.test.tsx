import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { THEME_STORAGE_KEY } from "@/lib/theme/theme-store";
import { ThemeInitScript } from "./ThemeInitScript";

describe("ThemeInitScript", () => {
  test("sets the saved light theme before hydration", () => {
    render(<ThemeInitScript />);

    const script = document.querySelector("script");

    expect(script?.innerHTML).toContain(THEME_STORAGE_KEY);
    expect(script?.innerHTML).toContain("localStorage.getItem");
    expect(script?.innerHTML).toContain("document.documentElement.dataset.theme");
    expect(script?.innerHTML).toContain("\"light\"");
  });
});
