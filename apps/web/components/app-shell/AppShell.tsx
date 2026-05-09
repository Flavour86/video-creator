"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { RuntimeHealthResponse, RuntimeState } from "@vc/shared-schemas";
import { IconButton, Kbd, SegmentedControl, StatusTag, type StatusTagVariant } from "@/components/ui";
import { useRuntimeStatus } from "@/lib/hooks/useRuntimeStatus";
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
  const t = useTranslations("appShell.statusBar.runtimeStatus");
  const routeStatus = useTranslations("appShell.statusBar.routeStatus");
  const pathname = usePathname();
  const { error, isLoading, status } = useRuntimeStatus();

  if (isLoading) {
    return <StatusTag variant="warning">{t("checking")}</StatusTag>;
  }

  if (pathname?.startsWith("/setup")) {
    return (
      <>
        <StatusTag variant="ready">{routeStatus("setupSidecar")}</StatusTag>
        <StatusTag variant="warning">{routeStatus("setupAlignment")}</StatusTag>
        <StatusTag variant="ready">{routeStatus("setupDisk")}</StatusTag>
        <StatusTag variant="info">{"E:\\claude\\video-creator\\projects\\test01"}</StatusTag>
      </>
    );
  }

  if ((pathname === "/" || pathname === "/launcher") && (error || !status)) {
    return <LauncherStatusContent routeStatus={routeStatus} />;
  }

  if (error || !status) {
    return <StatusTag variant="error">{t("fetchFailed")}</StatusTag>;
  }

  const renderCacheVariant = status.active_renders > 0 ? "warning" : "ready";

  if (pathname === "/launcher") {
    return <LauncherStatusContent routeStatus={routeStatus} />;
  }

  return (
    <>
      <StatusTag variant={variantForRuntimeState(status.sidecar.status)}>
        {t("sidecar", { value: sidecarValue(status, (state) => t(state)) })}
      </StatusTag>
      <StatusTag variant={variantForRuntimeState(status.ffmpeg.status)}>
        {t("ffmpeg", { value: versionValue(status.ffmpeg.status, status.ffmpeg.version, (state) => t(state)) })}
      </StatusTag>
      <StatusTag variant={variantForRuntimeState(status.cuda.status)}>
        {t("cuda", { value: cudaValue(status, (state) => t(state)) })}
      </StatusTag>
      <StatusTag variant={renderCacheVariant}>
        {t("renderCache", { renders: status.active_renders, cache: status.cached_projects })}
      </StatusTag>
    </>
  );
}

function LauncherStatusContent({ routeStatus }: { routeStatus: (key: string) => string }) {
  return (
    <>
      <StatusTag variant="ready">{routeStatus("launcherSidecar")}</StatusTag>
      <StatusTag variant="ready">{routeStatus("launcherFfmpeg")}</StatusTag>
      <StatusTag variant="ready">{routeStatus("launcherCuda")}</StatusTag>
      <StatusTag variant="info">{routeStatus("launcherNodePython")}</StatusTag>
    </>
  );
}

function variantForRuntimeState(state: RuntimeState): StatusTagVariant {
  if (state === "ready") {
    return "ready";
  }

  return state === "unknown" ? "warning" : "error";
}

function versionValue(state: RuntimeState, version: string, runtimeStateLabel: (state: RuntimeState) => string) {
  if (state === "ready" && version !== "unknown") {
    return version;
  }

  return runtimeStateLabel(state);
}

function sidecarValue(status: RuntimeHealthResponse, runtimeStateLabel: (state: RuntimeState) => string) {
  if (status.sidecar.status !== "ready") {
    return runtimeStateLabel(status.sidecar.status);
  }

  return status.sidecar.address.replace(/^https?:\/\//, "");
}

function cudaValue(status: RuntimeHealthResponse, runtimeStateLabel: (state: RuntimeState) => string) {
  if (status.cuda.status !== "ready" || status.cuda.available !== true) {
    return runtimeStateLabel(status.cuda.status);
  }

  const values = [status.cuda.version, status.cuda.gpu_label].filter((value) => value && value !== "unknown");

  return values.length > 0 ? values.join(" · ") : runtimeStateLabel("ready");
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
  const projectMetadata = pathname?.startsWith("/setup") || pathname?.startsWith("/editor") || pathname?.startsWith("/render")
    ? "test01/project.json"
    : "tokyo-essay/project.json";

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
            <span className="vc-type-body hidden font-bold text-(--text) lg:inline">{t("brand.productName")}</span>
            <span className="vc-type-caption hidden text-(--text-3) xl:inline">{t("brand.phaseLabel")}</span>
          </div>
          <nav
            aria-label={t("controls.globalNavLabel")}
            className="absolute left-[72px] right-[94px] top-1/2 -translate-y-1/2 overflow-x-auto lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:overflow-visible"
          >
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
              className="hidden h-8 w-8 rounded-(--r-sm) sm:grid"
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
        className="fixed bottom-0 left-0 right-0 z-40 h-(--space-10) border-t border-(--line) bg-(--bg-1)"
      >
        <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center px-(--space-4) sm:grid-cols-3">
          <div
            aria-label={t("statusBar.command")}
            className="flex min-w-0 items-center gap-(--space-2) rounded-(--r-sm) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
            tabIndex={0}
          >
            <Kbd>⌘K</Kbd>
            <span className="vc-type-caption text-(--text-3)">{t("statusBar.command")}</span>
          </div>
          <div
            className="hidden min-w-0 items-center justify-center gap-(--space-2) overflow-hidden sm:flex"
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
              {projectMetadata}
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
