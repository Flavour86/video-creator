"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Kbd } from "@/components/ui";
import { useLanguageStore } from "@/lib/i18n/language-store";
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

  return (
    <div className="min-h-screen bg-(--bg-0) pb-(--space-10) text-(--text)">
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
