import { THEME_STORAGE_KEY } from "@/lib/theme/theme-constants";

const themeInitScript = `
(() => {
  try {
    const theme = window.localStorage.getItem("${THEME_STORAGE_KEY}");

    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
      return;
    }

    delete document.documentElement.dataset.theme;
  } catch {
  }
})();
`;

export function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} suppressHydrationWarning />;
}
