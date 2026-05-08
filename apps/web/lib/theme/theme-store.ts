import { create } from "zustand";

export const THEME_STORAGE_KEY = "vc.theme";

export type ThemeMode = "dark" | "light";

type ThemeStore = {
  hydrateTheme: () => void;
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
};

function normalizeTheme(value: string | null): ThemeMode {
  return value === "light" ? "light" : "dark";
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
    return;
  }

  delete document.documentElement.dataset.theme;
}

function persistTheme(theme: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  hydrateTheme: () => {
    const theme = readStoredTheme();

    applyTheme(theme);
    set({ hydrated: true, theme });
  },
  hydrated: false,
  setTheme: (theme) => {
    persistTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
  theme: "dark",
  toggleTheme: () => {
    const nextTheme = get().theme === "light" ? "dark" : "light";

    get().setTheme(nextTheme);
  },
}));
