import { beforeEach, describe, expect, test } from "vitest";

import { LANGUAGE_STORAGE_KEY, useLanguageStore } from "./language-store";

describe("language store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "en";
    useLanguageStore.setState({ hydrated: false, language: "en" });
  });

  test("defaults to English and applies the html lang attribute", () => {
    useLanguageStore.getState().hydrateLanguage();

    expect(useLanguageStore.getState().language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  test("persists and applies Chinese globally", () => {
    useLanguageStore.getState().setLanguage("zh");

    expect(useLanguageStore.getState().language).toBe("zh");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
  });

  test("hydrates from localStorage", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    useLanguageStore.getState().hydrateLanguage();

    expect(useLanguageStore.getState().language).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
  });
});
