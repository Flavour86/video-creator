"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { IconButton, Kbd, SegmentedControl } from "@/components/ui";
import { useLanguageStore, type LanguageMode } from "@/lib/i18n/language-store";
import { dictionaries } from "@/lib/i18n/messages";
import { useThemeStore } from "@/lib/theme/theme-store";

export type AppShellProps = {
  children: ReactNode;
  statusContent?: ReactNode;
};

type AppShellChromeProps = {
  children: ReactNode;
};

function AppShellChrome({ children }: AppShellChromeProps) {
  const t = useTranslations("appShell");
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <div className="min-h-screen bg-(--bg-0) pb-(--space-10) text-(--text)">
      <header className="relative h-11 w-full border-b border-(--line) bg-(--bg-1)">
        <div className="flex h-full items-center justify-between gap-(--space-4) px-(--space-5)">
          <Link
            aria-label={t("nav.launcher")}
            className="flex shrink-0 items-center gap-(--space-3) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
            data-testid="brand-cluster"
            href="/"
          >
            <span
              aria-hidden="true"
              className="vc-type-caption flex h-6 w-6 items-center justify-center rounded-(--r-sm) bg-(--text) font-bold text-(--bg-0)"
            >
              {t("brand.mark")}
            </span>
            <span className="vc-type-body font-bold text-(--text)">{t("brand.productName")}</span>
          </Link>
          <div className="flex items-center gap-(--space-2)">
            <IconButton
              icon={theme === "light" ? Moon : Sun}
              label={t("controls.themeLabel")}
              onClick={toggleTheme}
              title={t("controls.themeLabel")}
            />
            <SegmentedControl
              ariaLabel={t("controls.languageLabel")}
              items={[
                { ariaLabel: t("controls.languageOptions.en"), label: t("controls.languageOptions.en"), value: "en" },
                { ariaLabel: t("controls.languageOptions.zh"), label: t("controls.languageOptions.zh"), value: "zh" },
              ]}
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
        className="fixed bottom-0 left-0 right-0 z-40 h-(--space-10) border-t border-(--line) bg-(--bg-1)"
      >
        <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center px-(--space-4)">
          <div
            aria-label={t("statusBar.command")}
            className="flex min-w-0 items-center gap-(--space-2) rounded-(--r-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
            tabIndex={0}
          >
            <Kbd>⌘K</Kbd>
            <span className="vc-type-caption text-(--text-3)">{t("statusBar.command")}</span>
          </div>
          <span className="vc-type-mono-meta shrink-0 text-(--text-3)" data-i18n-neutral="true">
            v0.1.0-prototype
          </span>
        </div>
      </footer>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const hydrateLanguage = useLanguageStore((state) => state.hydrateLanguage);
  const language = useLanguageStore((state) => state.language);
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);

  useEffect(() => {
    hydrateLanguage();
    hydrateTheme();
  }, [hydrateLanguage, hydrateTheme]);

  return (
    <NextIntlClientProvider locale={language} messages={dictionaries[language]} timeZone="UTC">
      <AppShellChrome>{children}</AppShellChrome>
    </NextIntlClientProvider>
  );
}
