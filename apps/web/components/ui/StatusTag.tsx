import type { HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type StatusTagVariant =
  | "idle"
  | "cached"
  | "aligned"
  | "composing"
  | "missing-asset"
  | "ready"
  | "warning"
  | "info"
  | "error";

export type StatusTagProps = HTMLAttributes<HTMLSpanElement> & {
  variant: StatusTagVariant;
};

const baseStatusTagClasses = [
  "vc-type-caption",
  "vc-radius-pill",
  "inline-flex",
  "items-center",
  "gap-(--space-2)",
  "border",
  "px-(--space-3)",
  "py-(--space-1)",
  "leading-none",
].join(" ");

const statusTagVariantClasses: Record<StatusTagVariant, string> = {
  idle: "border-(--line) bg-(--bg-3) text-(--text-2)",
  cached: "border-transparent bg-(--violet) text-(--bg-0)",
  aligned: "border-transparent bg-(--green) text-(--bg-0)",
  composing: "border-transparent bg-(--amber) text-(--bg-0)",
  "missing-asset": "border-transparent bg-(--red) text-(--text)",
  ready: "border-transparent bg-(--green) text-(--bg-0)",
  warning: "border-transparent bg-(--amber) text-(--bg-0)",
  info: "border-transparent bg-(--blue) text-(--bg-0)",
  error: "border-transparent bg-(--red) text-(--text)",
};

export function StatusTag({ children, className, variant, ...spanProps }: StatusTagProps) {
  return (
    <span className={twMerge(clsx(baseStatusTagClasses, statusTagVariantClasses[variant], className))} {...spanProps}>
      <span aria-hidden="true" className="h-(--space-1) w-(--space-1) rounded-(--r-pill) bg-current" />
      {children}
    </span>
  );
}
