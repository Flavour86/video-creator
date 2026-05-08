import { create } from "zustand";

export const LANGUAGE_STORAGE_KEY = "vc.language";

export type LanguageMode = "en" | "zh";

type LanguageStore = {
  hydrateLanguage: () => void;
  hydrated: boolean;
  language: LanguageMode;
  setLanguage: (language: LanguageMode) => void;
};

function normalizeLanguage(value: string | null): LanguageMode {
  return value === "zh" ? "zh" : "en";
}

function readStoredLanguage(): LanguageMode {
  if (typeof window === "undefined") {
    return "en";
  }

  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

function applyLanguage(language: LanguageMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = language;
}

function persistLanguage(language: LanguageMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  hydrateLanguage: () => {
    const language = readStoredLanguage();

    applyLanguage(language);
    set({ hydrated: true, language });
  },
  hydrated: false,
  language: "en",
  setLanguage: (language) => {
    persistLanguage(language);
    applyLanguage(language);
    set({ language });
  },
}));
