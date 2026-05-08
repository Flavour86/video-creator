"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { IconButton, SegmentedControl } from "@/components/ui";

export type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/", label: "Launcher", value: "launcher" },
  { href: "/setup", label: "Setup", value: "setup" },
  { href: "/editor", label: "Editor", value: "editor" },
  { href: "/render", label: "Render", value: "render" },
  { href: "/tokens", label: "Tokens", value: "tokens" },
] as const;

type NavValue = (typeof navItems)[number]["value"];
type ThemeMode = "dark" | "light";

function valueForPathname(pathname: string | null): NavValue {
  const current = pathname ?? "/";
  const match = navItems.find((item) => item.href === current || (item.href !== "/" && current.startsWith(item.href)));

  return match?.value ?? "launcher";
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";

    setTheme(currentTheme);
  }, []);

  const ThemeIcon = theme === "light" ? Moon : Sun;

  function handleThemeToggle() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "light" ? "dark" : "light";

      if (nextTheme === "light") {
        document.documentElement.dataset.theme = "light";
      } else {
        delete document.documentElement.dataset.theme;
      }

      return nextTheme;
    });
  }

  return (
    <div className="min-h-screen bg-(--bg-0) text-(--text)">
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
              onClick={handleThemeToggle}
            />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
