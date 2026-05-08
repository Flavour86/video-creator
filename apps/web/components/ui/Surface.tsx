import { forwardRef, type HTMLAttributes } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type SurfaceTone = "panel" | "raised" | "active";
export type SurfacePadding = "none" | "small" | "default" | "large";

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  padding?: SurfacePadding;
  tone?: SurfaceTone;
};

const baseSurfaceClasses = [
  "border",
  "border-(--line)",
  "text-(--text)",
  "transition-colors",
].join(" ");

const surfaceToneClasses: Record<SurfaceTone, string> = {
  panel: "bg-(--bg-1)",
  raised: "bg-(--bg-2) shadow-(--shadow-1)",
  active: "bg-(--bg-5)",
};

const surfacePaddingClasses: Record<SurfacePadding, string> = {
  none: "p-0",
  small: "p-(--space-4)",
  default: "p-(--space-6)",
  large: "p-(--space-8)",
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, padding = "default", tone = "panel", ...surfaceProps },
  ref,
) {
  return (
    <div
      className={twMerge(
        clsx(baseSurfaceClasses, surfaceToneClasses[tone], surfacePaddingClasses[padding], "rounded-(--r)", className),
      )}
      ref={ref}
      {...surfaceProps}
    />
  );
});
