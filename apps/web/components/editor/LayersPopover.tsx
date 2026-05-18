import { useEffect, useRef } from "react";
import { Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui";
import type { Layer } from "@/lib/preview/resolveDisplay";

type LayersPopoverProps = {
  layers: Layer[];
  onAdd: () => void;
  open: boolean;
  selected: { layerId: string; itemId: string } | null;
  onSelectLayerItem: (layerId: string, itemId: string) => void;
  onRemoveBackground: (layerId: string) => void;
  onClose: () => void;
};

export function LayersPopover({
  layers,
  onAdd,
  open,
  selected,
  onSelectLayerItem,
  onRemoveBackground,
  onClose,
}: LayersPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("pages.editor.layers");

  useEffect(() => {
    if (!open) return;

    function onDocumentMouseDown(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('[data-editor-layers-trigger="true"]')) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-md border border-(--line) bg-(--bg-2)/95 p-3 shadow-(--shadow-2) backdrop-blur"
      id="editor-layers-popover"
      ref={popoverRef}
    >
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">{t("head")}</div>
      <div className="flex flex-col">
        {layers.map((layer) => (
          <div
            className={`flex items-center gap-2 rounded px-2 py-2 ${selected?.layerId === layer.id ? "bg-(--bg-3)" : "hover:bg-(--bg-3)"}`}
            key={layer.id}
          >
            <span className={`h-2 w-2 rounded-full ${dotClass(layer.kind)}`} />
            <button
              className="flex flex-1 items-center gap-2 text-left"
              onClick={() => {
                const firstItemId = layer.items[0] && typeof layer.items[0] === "object" && "id" in (layer.items[0] as object)
                  ? String((layer.items[0] as { id: string }).id)
                  : null;
                if (firstItemId) {
                  onSelectLayerItem(layer.id, firstItemId);
                  onClose();
                }
              }}
              type="button"
            >
              <span className="flex-1 text-sm text-(--text-2)">{layer.name}</span>
              <span className="font-mono text-[11px] text-(--text-3)">{layer.items.length}</span>
            </button>
            {layer.kind === "bg" ? (
              <IconButton
                className="h-6 w-6"
                icon={Trash}
                label={t("delete")}
                onClick={() => {
                  onRemoveBackground(layer.id);
                  onClose();
                }}
                variant="danger"
              />
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
