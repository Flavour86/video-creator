import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type LayerChipVariant = "subtitles" | "pip" | "foreground" | "background";

export type LayerChipProps = HTMLAttributes<HTMLSpanElement> & {
  label: ReactNode;
  variant: LayerChipVariant;
  zIndex?: number;
};

const baseLayerChipClasses = [
  "vc-type-caption",
  "vc-radius-pill",
  "inline-flex",
  "items-center",
  "gap-(--space-2)",
  "border",
  "bg-(--bg-2)",
  "px-(--space-3)",
  "py-(--space-1)",
  "text-(--text)",
  "leading-none",
].join(" ");

const layerChipVariantClasses: Record<LayerChipVariant, string> = {
  subtitles: "border-(--violet)",
  pip: "border-(--blue)",
  foreground: "border-(--amber)",
  background: "border-(--green)",
};

const layerChipDotClasses: Record<LayerChipVariant, string> = {
  subtitles: "bg-(--violet)",
  pip: "bg-(--blue)",
  foreground: "bg-(--amber)",
  background: "bg-(--green)",
};

export function LayerChip({ className, label, variant, zIndex, ...spanProps }: LayerChipProps) {
  return (
    <span className={twMerge(clsx(baseLayerChipClasses, layerChipVariantClasses[variant], className))} {...spanProps}>
      <span
        aria-hidden="true"
        className={twMerge(clsx("h-(--space-1) w-(--space-1) rounded-(--r-pill)", layerChipDotClasses[variant]))}
      />
      <span>{label}</span>
      {zIndex ? <span className="vc-type-mono-meta text-(--text-3)">z{zIndex}</span> : null}
    </span>
  );
}
