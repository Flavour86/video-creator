import { Settings, Trash } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, IconButton, Select } from "@/components/ui";

export function HistorySettingsPopover({ onPurge }: { onPurge: () => void }) {
  const t = useTranslations("pages.render.history.settings");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="relative">
      <IconButton icon={Settings} label={t("label")} onClick={() => setOpen((value) => !value)} />
      {open ? (
        <div className="absolute right-0 top-9 z-20 flex w-[240px] flex-col gap-3 rounded-[10px] border border-(--line) bg-(--bg-1) p-3 shadow-(--shadow-2)">
          <label className="flex items-center justify-between gap-3 text-xs text-(--text-2)">
            <span>{t("keepCancelled")}</span>
            <input className="accent-(--amber)" defaultChecked id="render-keep-cancelled" name="render-keep-cancelled" type="checkbox" />
          </label>
          <label className="grid gap-1 text-xs text-(--text-2)">
            <span>{t("maxEntries")}</span>
            <Select defaultValue="50" id="render-history-max" name="render-history-max">
              <option>25</option>
              <option>50</option>
              <option>100</option>
              <option>unlimited</option>
            </Select>
          </label>
          <Button className="justify-start text-(--red)" onClick={() => setConfirm(true)} size="extra-small" variant="ghost">
            <Trash aria-hidden="true" className="h-4 w-4" />
            {t("purgeAll")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        body={t("purgeBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("purgeAll")}
        destructive
        onConfirm={onPurge}
        onOpenChange={setConfirm}
        open={confirm}
        title={t("purgeTitle")}
      />
    </div>
  );
}
