import * as Dialog from "@radix-ui/react-dialog";
import { Folder, Trash2, X } from "lucide-react";
import type { Project } from "@vc/shared-schemas";
import { useRef } from "react";
import { Button } from "@/components/ui";
import { moveIdRelativeTo, type ReorderPlacement } from "@/lib/media-order";
import { useReorderableAssetMotion } from "@/lib/use-reorderable-asset-motion";
import type { EditorMediaItem } from "./types";

type WatermarkModalProps = {
  media: EditorMediaItem[];
  onChange: (watermark: Project["watermark"]) => void;
  onClose: () => void;
  onDeleteMedia?: (mediaId: string) => void;
  onImport: (files: FileList | null) => Promise<unknown> | unknown;
  onReorderMedia?: (mediaIds: string[]) => void;
  open: boolean;
  projectPath: string;
  value: Project["watermark"];
};

type WatermarkMedia = EditorMediaItem & { kind: "image" | "watermark_image" };

export function WatermarkModal({
  media,
  onChange,
  onClose,
  onDeleteMedia,
  onImport,
  onReorderMedia,
  open,
  projectPath,
  value,
}: WatermarkModalProps) {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const enabled = Boolean(value && value.enabled !== false);
  const selectedId = value?.mediaId ?? "";
  const selectable = media.filter(isWatermarkMedia);
  const reorderMotion = useReorderableAssetMotion(selectable.map((item) => item.mediaId || item.filename), reorderMedia);
  const selected = selectable.find((item) => item.mediaId === selectedId || item.filename === selectedId) ?? null;

  function toggleEnabled(nextEnabled: boolean) {
    if (value) {
      onChange({ ...value, enabled: nextEnabled });
      return;
    }
    const fallback = selectable[0];
    if (!fallback) return;
    onChange(defaultWatermark(fallback.mediaId || fallback.filename));
  }

  function selectAsset(mediaId: string) {
    if (!value) {
      onChange(defaultWatermark(mediaId));
      return;
    }
    onChange({ ...value, mediaId });
  }

  function reorderMedia(sourceId: string, targetId: string, placement: ReorderPlacement) {
    const currentOrder = selectable.map((item) => item.mediaId || item.filename);
    const nextOrder = moveIdRelativeTo(currentOrder, sourceId, targetId, placement);
    if (currentOrder.length === nextOrder.length && currentOrder.every((id, index) => id === nextOrder[index])) return;
    onReorderMedia?.(nextOrder);
  }

  return (
    <Dialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-(--bg-0)/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(560px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-(--r-lg) border border-(--line) bg-(--bg-1) shadow-(--shadow-2)">
          <header className="flex items-start justify-between gap-3 border-b border-(--line-soft) px-5 py-[15px]">
            <div>
              <Dialog.Title className="text-base font-semibold text-(--text)">Watermark asset</Dialog.Title>
              <Dialog.Description className="mt-[3px] text-xs text-(--text-3)">
                Pick an image watermark for the render overlay.
              </Dialog.Description>
            </div>
            <button aria-label="Close watermark modal" className="rounded p-1 text-(--text-3) hover:bg-(--bg-3) hover:text-(--text)" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex flex-col gap-4 overflow-y-auto px-[19px] pb-[30px] pt-4">
            <div className="flex items-center justify-between gap-3 py-1.5" data-testid="watermark-import-row">
              <div className="flex items-center gap-2.5">
                <button
                  aria-checked={enabled}
                  aria-label="Watermark enabled"
                  className={`inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                    enabled ? "border-(--amber) bg-(--amber)" : "border-(--line) bg-(--bg-3)"
                  }`}
                  onClick={() => toggleEnabled(!enabled)}
                  role="switch"
                  type="button"
                >
                  <span className={`h-4 w-4 rounded-full transition-transform ${enabled ? "translate-x-[17px] bg-(--bg-0)" : "translate-x-px bg-white"}`} />
                </button>
                <span className="text-xs text-(--text-2)">Watermark enabled</span>
              </div>

              <input
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                aria-label="Import from disk"
                className="hidden"
                onChange={(event) => void onImport(event.currentTarget.files)}
                ref={uploadRef}
                type="file"
              />
              <button
                className="inline-flex shrink-0 items-center gap-2 rounded border border-(--line) bg-(--bg-2) px-2.5 py-1.5 text-xs font-semibold text-(--text-2) hover:bg-(--bg-3)"
                onClick={() => uploadRef.current?.click()}
                type="button"
              >
                <Folder aria-hidden="true" className="h-3.5 w-3.5" />
                Import from disk...
              </button>
            </div>

            {selectable.length > 0 ? (
              <div className="flex max-h-[360px] gap-2 overflow-x-auto overflow-y-hidden pb-1" data-reorder-rail="true">
                {selectable.map((item) => {
                  const active = selectedId === item.mediaId || selectedId === item.filename;
                  const src = watermarkThumbSrc(projectPath, item);
                  const mediaId = item.mediaId || item.filename;
                  const hasError = Boolean(item.import_error);
                  return (
                    <div
                      className="relative w-[118px] shrink-0 cursor-grab will-change-transform active:cursor-grabbing"
                      data-media-id={mediaId}
                      data-reorder-card="true"
                      key={mediaId}
                      ref={(node) => reorderMotion.registerNode(mediaId, node)}
                      onClickCapture={reorderMotion.suppressClickAfterDrag}
                      onPointerCancel={reorderMotion.cancelPointerDrag}
                      onPointerDown={(event) => {
                        if (hasError) return;
                        reorderMotion.beginPointerDrag(mediaId, event);
                      }}
                      onPointerMove={reorderMotion.movePointerDrag}
                      onPointerUp={reorderMotion.endPointerDrag}
                    >
                      <button
                        aria-label={`${item.filename}${active ? " selected" : ""}`}
                        aria-pressed={active}
                        disabled={hasError}
                        className={`flex w-full flex-col gap-1.5 overflow-hidden rounded-(--r-sm) border p-1.5 text-left transition ${
                          active
                            ? "border-(--amber) bg-(--bg-3) shadow-[0_0_0_3px_var(--amber-bg)]"
                            : hasError
                              ? "border-(--red) bg-(--bg-2) opacity-90"
                            : "border-(--line) bg-(--bg-2) hover:border-(--amber)/45"
                        }`}
                        onClick={() => selectAsset(mediaId)}
                        type="button"
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-(--r-xs) bg-(--bg-3)">
                          {src ? <img alt="" className="h-full w-full object-cover" src={src} /> : null}
                          <span className="absolute left-1 top-1 rounded-[3px] bg-black/60 px-[5px] py-px font-mono text-[9px] uppercase tracking-[0.04em] text-white">
                            IMG
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-(--text)">{item.filename}</div>
                        {item.import_error ? (
                          <div className="truncate font-mono text-[10px] text-(--red)">{item.import_error}</div>
                        ) : null}
                      </button>
                      {item.deletable && onDeleteMedia ? (
                        <button
                          aria-label={`Delete ${item.filename}`}
                          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded bg-black/65 text-white transition hover:bg-(--red) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--amber)"
                          data-reorder-delete="true"
                          onClick={() => onDeleteMedia(mediaId)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded border border-dashed border-(--line) bg-(--bg-2) px-3 py-4 font-mono text-xs text-(--text-3)">
                No watermark assets selected yet.
              </div>
            )}

            <p className="mt-[14px] text-xs text-(--text-2)">
              Current watermark: {selected ? `${selected.filename} / image overlay.` : "none"}
            </p>

            {value ? (
              <section className="grid gap-3 border-t border-(--line-soft) pt-4" aria-label="Watermark placement and appearance">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-(--text-3)">
                    <span className="w-10 shrink-0 font-mono uppercase">POSX</span>
                    <input
                      aria-label="Watermark POSX"
                      className="h-8 min-w-0 flex-1 rounded-(--r-sm) border border-(--line) bg-(--bg-2) px-2 font-mono text-xs text-(--text)"
                      max={100}
                      min={0}
                      onChange={(event) => onChange({ ...value, posX: clamp(Number(event.target.value), 0, 100) })}
                      type="number"
                      value={value.posX}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-(--text-3)">
                    <span className="w-10 shrink-0 font-mono uppercase">POSY</span>
                    <input
                      aria-label="Watermark POSY"
                      className="h-8 min-w-0 flex-1 rounded-(--r-sm) border border-(--line) bg-(--bg-2) px-2 font-mono text-xs text-(--text)"
                      max={100}
                      min={0}
                      onChange={(event) => onChange({ ...value, posY: clamp(Number(event.target.value), 0, 100) })}
                      type="number"
                      value={value.posY}
                    />
                  </label>
                </div>
                <ControlSlider
                  label="Size"
                  max={0.5}
                  min={0.02}
                  onChange={(scale) => onChange({ ...value, scale })}
                  output={`${Math.round(value.scale * 100)}%`}
                  step={0.01}
                  value={value.scale}
                />
                <ControlSlider
                  label="Opacity"
                  max={100}
                  min={0}
                  onChange={(opacity) => onChange({ ...value, opacity })}
                  output={`${Math.round(value.opacity)}%`}
                  step={1}
                  value={value.opacity}
                />
              </section>
            ) : null}
          </div>

          <footer className="flex justify-end border-t border-(--line-soft) bg-(--bg-2) px-5 py-[14px]">
            <Button className="h-[31px] bg-(--text) px-4 text-xs font-medium text-(--bg-0) hover:bg-(--text)" onClick={onClose} size="small" variant="primary">Done</Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function isWatermarkMedia(item: EditorMediaItem): item is WatermarkMedia {
  return item.kind === "watermark_image" || (item.role === "watermark" && item.kind === "image");
}

function watermarkThumbSrc(projectPath: string, item: EditorMediaItem): string | null {
  if (item.thumb_url) {
    return `/api/server${item.thumb_url}`;
  }
  if (item.path.startsWith("uploads/")) {
    return `/api/server/uploads/media-file?filename=${encodeURIComponent(item.mediaId || item.filename)}`;
  }
  if (!projectPath) return null;
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.filename)}`;
}

function defaultWatermark(mediaId: string): NonNullable<Project["watermark"]> {
  return {
    enabled: true,
    mediaId,
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  };
}

function ControlSlider({
  label,
  max,
  min,
  onChange,
  output,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  output: string;
  step: number;
  value: number;
}) {
  return (
    <label className="grid grid-cols-[54px_minmax(0,1fr)_42px] items-center gap-2 text-[11px] text-(--text-3)">
      <span>{label}</span>
      <input
        aria-label={`Watermark ${label.toLowerCase()}`}
        className="h-2 w-full accent-(--amber)"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="text-right font-mono text-(--text-2)">{output}</span>
    </label>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
