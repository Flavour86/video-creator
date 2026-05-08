import { beforeEach, describe, expect, test } from "vitest";

import { THEME_STORAGE_KEY, useThemeStore } from "./theme-store";

describe("theme store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    useThemeStore.setState({ hydrated: false, theme: "dark" });
  });

  test("defaults to dark and clears the theme dataset marker", () => {
    useThemeStore.getState().hydrateTheme();

    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test("persists and applies light theme globally", () => {
    useThemeStore.getState().setTheme("light");

    expect(useThemeStore.getState().theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("hydrates from localStorage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    useThemeStore.getState().hydrateTheme();

    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
