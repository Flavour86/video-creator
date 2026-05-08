import type { ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type SegmentedControlTone = "surface" | "accent";

export type SegmentedControlItem = {
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

export type SegmentedControlProps = {
  ariaLabel: string;
  className?: string;
  items: SegmentedControlItem[];
  onValueChange: (value: string) => void;
  tone?: SegmentedControlTone;
  value: string;
};

const rootClasses = [
  "inline-flex",
  "items-center",
  "gap-(--space-1)",
  "rounded-(--r)",
  "border",
  "border-(--line-soft)",
  "bg-(--bg-1)",
  "p-(--space-1)",
].join(" ");

const itemBaseClasses = [
  "vc-type-caption",
  "inline-flex",
  "h-(--space-8)",
  "items-center",
  "justify-center",
  "rounded-(--r-sm)",
  "px-(--space-4)",
  "text-(--text-2)",
  "transition-colors",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-(--blue)",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

const activeItemClasses: Record<SegmentedControlTone, string> = {
  surface: "bg-(--bg-4) text-(--text) shadow-(--shadow-1)",
  accent: "bg-(--blue) text-(--text) shadow-(--shadow-1)",
};

const inactiveItemClasses = "hover:bg-(--bg-2) hover:text-(--text)";

export function SegmentedControl({
  ariaLabel,
  className,
  items,
  onValueChange,
  tone = "surface",
  value,
}: SegmentedControlProps) {
  return (
    <div aria-label={ariaLabel} className={twMerge(clsx(rootClasses, className))} role="radiogroup">
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <button
            aria-checked={isActive}
            aria-label={item.ariaLabel}
            className={twMerge(clsx(itemBaseClasses, isActive ? activeItemClasses[tone] : inactiveItemClasses))}
            disabled={item.disabled}
            key={item.value}
            onClick={() => {
              if (!isActive && !item.disabled) {
                onValueChange(item.value);
              }
            }}
            role="radio"
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
