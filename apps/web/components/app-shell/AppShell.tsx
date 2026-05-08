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
      <header className="border-b border-(--line) bg-(--bg-1)">
        <nav
          aria-label="Global"
          className="flex min-h-(--space-11) items-center gap-(--space-4) px-(--space-6) vc-type-body"
        >
          {navItems.map((item) => (
            <Link className="text-(--text-2) transition-colors hover:text-(--text)" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
