import type { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type KbdProps = HTMLAttributes<HTMLElement>;

const kbdClasses = [
  "vc-type-mono-meta",
  "inline-flex",
  "items-center",
  "justify-center",
  "rounded-(--r-sm)",
  "border",
  "border-(--line)",
  "bg-(--bg-2)",
  "px-(--space-2)",
  "py-(--space-1)",
  "text-(--text-2)",
].join(" ");

export function Kbd({ className, ...kbdProps }: KbdProps) {
  return <kbd className={twMerge(clsx(kbdClasses, className))} {...kbdProps} />;
}
