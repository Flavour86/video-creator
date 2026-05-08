import type { LucideIcon } from "lucide-react";

import { Button, type ButtonProps } from "./Button";

export type IconButtonProps = Omit<ButtonProps, "children" | "size"> & {
  icon: LucideIcon;
  label: string;
};

export function IconButton({
  icon: Icon,
  label,
  title = label,
  variant = "ghost",
  ...buttonProps
}: IconButtonProps) {
  return (
    <Button {...buttonProps} aria-label={label} size="icon-only" title={title} variant={variant}>
      <Icon aria-hidden="true" focusable="false" size={16} />
    </Button>
  );
}
