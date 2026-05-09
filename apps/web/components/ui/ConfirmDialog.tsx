import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./Button";

export type ConfirmDialogProps = {
  body: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  body,
  cancelLabel,
  confirmLabel,
  destructive = false,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-(--bg-0)/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-(--line) bg-(--bg-1) p-5 shadow-(--shadow-2)">
          <Dialog.Title className="text-lg font-semibold text-(--text)">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-(--text-2)">{body}</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </Dialog.Close>
            <Button
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              variant={destructive ? "danger" : "primary"}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
