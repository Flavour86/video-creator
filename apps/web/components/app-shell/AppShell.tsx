"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { IconButton, Kbd, SegmentedControl, StatusTag } from "@/components/ui";
import { useLanguageStore, type LanguageMode } from "@/lib/i18n/language-store";
import { dictionaries } from "@/lib/i18n/messages";
import { useThemeStore } from "@/lib/theme/theme-store";

export type AppShellProps = {
  children: ReactNode;
  statusContent?: ReactNode;
};

const navItems = [
  { href: "/", key: "launcher", value: "launcher" },
  { href: "/setup", key: "setup", value: "setup" },
  { href: "/editor", key: "editor", value: "editor" },
  { href: "/render", key: "render", value: "render" },
  { href: "/tokens", key: "tokens", value: "tokens" },
] as const;

type NavValue = (typeof navItems)[number]["value"];

function valueForPathname(pathname: string | null): NavValue {
  const current = pathname ?? "/";
  const match = navItems.find((item) => item.href === current || (item.href !== "/" && current.startsWith(item.href)));

  return match?.value ?? "launcher";
}

function DefaultStatusContent() {
  const t = useTranslations("appShell.statusBar.defaults");

  return (
    <>
      <StatusTag variant="aligned">{t("alignmentCached")}</StatusTag>
      <StatusTag variant="cached">{t("cacheWarm", { count: "24/24" })}</StatusTag>
      <StatusTag variant="idle">{t("autosaveAgo", { seconds: "02" })}</StatusTag>
    </>
  );
}

type AppShellChromeProps = AppShellProps & {
  language: LanguageMode;
  setLanguage: (language: LanguageMode) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
};

function AppShellChrome({ children, language, setLanguage, statusContent, theme, toggleTheme }: AppShellChromeProps) {
  const t = useTranslations("appShell");
  const globalControls = useTranslations("globalControls");
  const pathname = usePathname();

  const localizedNavItems = navItems.map((item) => ({
    label: t(`nav.${item.key}`),
    value: item.value,
  }));
  const languageItems = [
    { label: t("controls.languageOptions.en"), value: "en" },
    { label: t("controls.languageOptions.zh"), value: "zh" },
  ] as const;
  const themeLabel = globalControls("tooltips.toggleTheme");
  const ThemeIcon = theme === "light" ? Moon : Sun;

  return (
    <div className="min-h-screen bg-(--bg-0) pb-(--space-9) text-(--text)">
      <header className="relative h-11 w-full border-b border-(--line) bg-(--bg-1)">
        <div className="flex h-full items-center px-(--space-4)">
          <div className="flex shrink-0 items-center gap-(--space-3)" data-testid="brand-cluster">
            <span
              aria-hidden="true"
              className="vc-type-caption flex h-7 w-7 items-center justify-center rounded-(--r-sm) bg-(--text) font-bold text-(--bg-0)"
            >
              {t("brand.mark")}
            </span>
            <span className="vc-type-body font-bold text-(--text)">{t("brand.productName")}</span>
            <span className="vc-type-caption text-(--text-3)">{t("brand.phaseLabel")}</span>
          </div>
          <nav aria-label={t("controls.globalNavLabel")} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <SegmentedControl
              ariaLabel={t("controls.primaryNavigationLabel")}
              items={localizedNavItems}
              onValueChange={(value) => {
                const target = navItems.find((item) => item.value === value);

                if (target && target.href !== pathname) {
                  window.location.assign(target.href);
                }
              }}
              value={valueForPathname(pathname)}
            />
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-(--space-2)" data-testid="shell-right-controls">
            <IconButton
              className="h-8 w-8 rounded-(--r-sm)"
              icon={ThemeIcon}
              label={themeLabel}
              onClick={toggleTheme}
            />
            <SegmentedControl
              ariaLabel={t("controls.languageLabel")}
              className="grid grid-cols-2"
              items={[...languageItems]}
              onValueChange={(value) => {
                setLanguage(value as LanguageMode);
              }}
              value={language}
            />
          </div>
        </div>
      </header>
      {children}
      <footer
        aria-label={t("statusBar.ariaLabel")}
        className="fixed bottom-0 left-0 right-0 z-40 h-(--space-9) border-t border-(--line) bg-(--bg-1)"
      >
        <div className="grid h-full grid-cols-3 items-center px-(--space-4)">
          <div className="flex min-w-0 items-center gap-(--space-2)">
            <Kbd>⌘K</Kbd>
            <span className="vc-type-caption text-(--text-3)">{t("statusBar.command")}</span>
          </div>
          <div
            className="flex min-w-0 items-center justify-center gap-(--space-2) overflow-hidden"
            data-testid="status-center"
          >
            {statusContent ?? <DefaultStatusContent />}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-(--space-4)">
            <span
              className="vc-type-mono-meta min-w-0 truncate text-(--text-3)"
              data-i18n-neutral="true"
              data-testid="shell-technical-metadata"
            >
              tokyo-essay/project.json
            </span>
            <span
              className="vc-type-mono-meta shrink-0 text-(--text-3)"
              data-i18n-neutral="true"
              data-testid="shell-technical-metadata"
            >
              v0.1.0-prototype
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function AppShell({ children, statusContent }: AppShellProps) {
  const hydrateLanguage = useLanguageStore((state) => state.hydrateLanguage);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    hydrateLanguage();
    hydrateTheme();
  }, [hydrateLanguage, hydrateTheme]);

  return (
    <NextIntlClientProvider locale={language} messages={dictionaries[language]} timeZone="UTC">
      <AppShellChrome
        language={language}
        setLanguage={setLanguage}
        statusContent={statusContent}
        theme={theme}
        toggleTheme={toggleTheme}
      >
        {children}
      </AppShellChrome>
    </NextIntlClientProvider>
  );
}
