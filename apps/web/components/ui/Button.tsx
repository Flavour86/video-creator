import { forwardRef, type ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type ButtonVariant = "primary" | "render" | "default" | "ghost" | "danger";
export type ButtonSize = "default" | "small" | "extra-small" | "icon-only";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const baseButtonClasses = [
  "vc-type-body",
  "inline-flex",
  "shrink-0",
  "items-center",
  "justify-center",
  "gap-(--space-2)",
  "whitespace-nowrap",
  "border",
  "border-transparent",
  "font-semibold",
  "transition-colors",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-(--blue)",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-(--blue) text-(--text) hover:brightness-110 active:brightness-95",
  render: "border-transparent bg-(--amber) text-(--bg-0) hover:brightness-110 active:brightness-95",
  default: "border-(--line) bg-(--bg-2) text-(--text) hover:bg-(--bg-3) active:bg-(--bg-4)",
  ghost: "border-transparent bg-transparent text-(--text-2) hover:bg-(--bg-2) hover:text-(--text)",
  danger: "border-transparent bg-(--red) text-(--text) hover:brightness-110 active:brightness-95",
};

const buttonSizeClasses: Record<ButtonSize, string> = {
  default: "h-(--space-10) rounded-(--r) px-(--space-5)",
  small: "h-(--space-9) rounded-(--r) px-(--space-4)",
  "extra-small": "vc-type-caption h-(--space-8) rounded-(--r-sm) px-(--space-3)",
  "icon-only": "h-(--space-9) w-(--space-9) rounded-(--r-pill) p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = "default", type = "button", variant = "default", ...buttonProps },
  ref,
) {
  return (
    <button
      className={twMerge(clsx(baseButtonClasses, buttonVariantClasses[variant], buttonSizeClasses[size], className))}
      ref={ref}
      type={type}
      {...buttonProps}
    />
  );
});
