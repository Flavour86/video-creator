import { Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui";
import type { Layer } from "@/lib/preview/resolveDisplay";

type LayersPopoverProps = {
  layers: Layer[];
  onAdd: () => void;
  open: boolean;
};

export function LayersPopover({ layers, onAdd, open }: LayersPopoverProps) {
  const t = useTranslations("pages.editor.layers");
  if (!open) return null;
  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-md border border-(--line) bg-(--bg-2)/95 p-3 shadow-(--shadow-2) backdrop-blur">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">{t("head")}</div>
      <div className="flex flex-col">
        {layers.map((layer) => (
          <div className="flex items-center gap-2 rounded px-2 py-2 hover:bg-(--bg-3)" key={layer.id}>
            <span className={`h-2 w-2 rounded-full ${dotClass(layer.kind)}`} />
            <span className="flex-1 text-sm text-(--text-2)">{layer.name}</span>
            <span className="font-mono text-[11px] text-(--text-3)">{layer.items.length}</span>
            {layer.kind === "bg" || (layer.kind !== "sub" && layer.items.length === 0) ? (
              <IconButton className="h-6 w-6" icon={Trash} label={t("delete")} variant="danger" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-(--line-soft) pt-2">
        <Button className="w-full justify-center" onClick={onAdd} size="extra-small" variant="ghost">
          {t("add")}
        </Button>
      </div>
    </div>
  );
}

function dotClass(kind: Layer["kind"]): string {
  if (kind === "sub") return "bg-(--blue)";
  if (kind === "pip") return "bg-(--violet)";
  if (kind === "bg") return "bg-(--amber-2)";
  return "bg-(--amber)";
}
