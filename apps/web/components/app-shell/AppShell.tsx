"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/", label: "Launcher" },
  { href: "/setup", label: "Setup" },
  { href: "/editor", label: "Editor" },
  { href: "/render", label: "Render" },
] as const;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-(--bg-0) text-(--text)">
      <header className="h-11 w-full border-b border-(--line) bg-(--bg-1)">
        <div className="flex h-full items-center gap-(--space-6) px-(--space-4)">
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
          <nav aria-label="Global" className="flex h-full items-center gap-(--space-4) vc-type-body">
            {navItems.map((item) => (
              <Link className="text-(--text-2) transition-colors hover:text-(--text)" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
