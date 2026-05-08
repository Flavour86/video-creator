import type { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type PageChromeVariant = "default" | "empty" | "workbench";

export type PageChromeProps = HTMLAttributes<HTMLElement> & {
  variant?: PageChromeVariant;
};

const basePageChromeClasses = ["w-full", "bg-(--bg-0)", "text-(--text)"].join(" ");

const pageChromeVariantClasses: Record<PageChromeVariant, string> = {
  default:
    "flex min-h-[calc(100vh_-_2.75rem_-_var(--space-10))] flex-col gap-(--space-8) px-(--space-8) py-(--space-8)",
  empty:
    "flex min-h-[calc(100vh_-_2.75rem_-_var(--space-10))] flex-col items-center justify-center gap-(--space-3) px-(--space-8) py-(--space-8) text-center",
  workbench: "flex h-[calc(100vh_-_2.75rem_-_var(--space-10))] min-h-0 flex-col overflow-hidden",
};

export function PageChrome({ children, className, variant = "default", ...mainProps }: PageChromeProps) {
  return (
    <main className={twMerge(clsx(basePageChromeClasses, pageChromeVariantClasses[variant], className))} {...mainProps}>
      {children}
    </main>
  );
}
