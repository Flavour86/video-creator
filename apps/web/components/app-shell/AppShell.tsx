"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { IconButton, Kbd, SegmentedControl, StatusTag } from "@/components/ui";
import { useThemeStore } from "@/lib/theme/theme-store";

export type AppShellProps = {
  children: ReactNode;
  statusContent?: ReactNode;
};

const navItems = [
  { href: "/", label: "Launcher", value: "launcher" },
  { href: "/setup", label: "Setup", value: "setup" },
  { href: "/editor", label: "Editor", value: "editor" },
  { href: "/render", label: "Render", value: "render" },
  { href: "/tokens", label: "Tokens", value: "tokens" },
] as const;

const languageItems = [
  { label: "EN", value: "en" },
  { label: "中文", value: "zh" },
] as const;

type NavValue = (typeof navItems)[number]["value"];
type LanguageMode = (typeof languageItems)[number]["value"];

function valueForPathname(pathname: string | null): NavValue {
  const current = pathname ?? "/";
  const match = navItems.find((item) => item.href === current || (item.href !== "/" && current.startsWith(item.href)));

  return match?.value ?? "launcher";
}

function DefaultStatusContent() {
  return (
    <>
      <StatusTag variant="aligned">alignment cached</StatusTag>
      <StatusTag variant="cached">cache 24/24 warm</StatusTag>
      <StatusTag variant="idle">autosave · 02s ago</StatusTag>
    </>
  );
}

export function AppShell({ children, statusContent }: AppShellProps) {
  const pathname = usePathname();
  const [language, setLanguage] = useState<LanguageMode>("en");
  const hydrateTheme = useThemeStore((state) => state.hydrateTheme);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

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
              VC
            </span>
            <span className="vc-type-body font-bold text-(--text)">Video Creator</span>
            <span className="vc-type-caption text-(--text-3)">phase 1 - local</span>
          </div>
          <nav aria-label="Global" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <SegmentedControl
              ariaLabel="Primary navigation"
              items={navItems.map((item) => ({ label: item.label, value: item.value }))}
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
              label="Toggle theme"
              onClick={toggleTheme}
            />
            <SegmentedControl
              ariaLabel="Language"
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
        aria-label="Global status"
        className="fixed bottom-0 left-0 right-0 z-40 h-(--space-9) border-t border-(--line) bg-(--bg-1)"
      >
        <div className="grid h-full grid-cols-3 items-center px-(--space-4)">
          <div className="flex min-w-0 items-center gap-(--space-2)">
            <Kbd>⌘K</Kbd>
            <span className="vc-type-caption text-(--text-3)">command</span>
          </div>
          <div
            className="flex min-w-0 items-center justify-center gap-(--space-2) overflow-hidden"
            data-testid="status-center"
          >
            {statusContent ?? <DefaultStatusContent />}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-(--space-4)">
            <span className="vc-type-mono-meta min-w-0 truncate text-(--text-3)">tokyo-essay/project.json</span>
            <span className="vc-type-mono-meta shrink-0 text-(--text-3)">v0.1.0-prototype</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
