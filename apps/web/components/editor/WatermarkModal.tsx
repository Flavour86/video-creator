import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import type { Project } from "@vc/shared-schemas";
import { useRef } from "react";
import { Button } from "@/components/ui";
import type { EditorMediaItem } from "./types";

type WatermarkModalProps = {
  media: EditorMediaItem[];
  onChange: (watermark: Project["watermark"]) => void;
  onClose: () => void;
  onImport: (files: FileList | null) => Promise<void> | void;
  open: boolean;
  projectPath: string;
  value: Project["watermark"];
};

type WatermarkMedia = EditorMediaItem & { kind: "image" | "video" | "watermark_image" | "watermark_video" };

export function WatermarkModal({
  media,
  onChange,
  onClose,
  onImport,
  open,
  projectPath,
  value,
}: WatermarkModalProps) {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const selectable = media.filter(isWatermarkMedia);
  const enabled = value !== null;
  const selectedId = value?.mediaId ?? "";
  const selected = selectable.find((item) => item.mediaId === selectedId || item.filename === selectedId) ?? null;

  function toggleEnabled(nextEnabled: boolean) {
    if (!nextEnabled) {
      onChange(null);
      return;
    }
    if (value) return;
    const fallback = selectable[0];
    if (!fallback) return;
    onChange(defaultWatermark(fallback.mediaId || fallback.filename));
  }

  function selectAsset(mediaId: string) {
    if (!enabled) {
      onChange(defaultWatermark(mediaId));
      return;
    }
    if (!value) {
      onChange(defaultWatermark(mediaId));
      return;
    }
    onChange({ ...value, mediaId });
  }

  return (
    <Dialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-(--bg-0)/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-[min(820px,calc(100vw-32px))] max-w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-(--line) bg-(--bg-1) shadow-(--shadow-2)">
          <header className="flex items-start justify-between gap-4 border-b border-(--line) px-6 py-4">
            <div>
              <Dialog.Title className="text-3xl font-semibold tracking-[-0.01em] text-(--text)">Watermark asset</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-(--text-3)">
                Pick an image or video watermark. Video watermarks loop over the render.
              </Dialog.Description>
            </div>
            <button aria-label="Close watermark modal" className="rounded p-1 text-(--text-3) hover:bg-(--bg-3) hover:text-(--text)" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="space-y-4 px-6 py-5">
            <div className="flex items-center gap-3">
              <button
                aria-checked={enabled}
                aria-label="Watermark enabled"
                className={`inline-flex h-8 w-14 items-center rounded-full border transition-colors ${
                  enabled ? "border-(--amber) bg-(--amber)" : "border-(--line) bg-(--bg-3)"
                }`}
                onClick={() => toggleEnabled(!enabled)}
                role="switch"
                type="button"
              >
                <span className={`h-6 w-6 rounded-full bg-white transition-transform ${enabled ? "translate-x-7" : "translate-x-1"}`} />
              </button>
              <span className="text-lg text-(--text-2)">Watermark enabled</span>
            </div>

            <input
              accept=".png,.jpg,.jpeg,.mp4,image/png,image/jpeg,video/mp4"
              className="hidden"
              multiple
              onChange={(event) => void onImport(event.currentTarget.files)}
              ref={uploadRef}
              type="file"
            />
            <button
              className="flex w-full items-center justify-between gap-3 rounded-md border border-dashed border-(--line) bg-(--bg-2) px-4 py-4 text-left text-(--text-2) hover:border-(--amber)/50"
              onClick={() => uploadRef.current?.click()}
              type="button"
            >
              <span className="inline-flex items-center gap-2 text-lg">
                <Upload className="h-4 w-4" />
                Upload image or video watermark...
              </span>
              <span className="font-mono text-sm text-(--text-4)">PNG / JPG / MP4</span>
            </button>

            <div className="grid max-h-[360px] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-4">
              {selectable.map((item) => {
                const active = selectedId === item.mediaId || selectedId === item.filename;
                const src = watermarkThumbSrc(projectPath, item);
                const mediaId = item.mediaId || item.filename;
                return (
                  <button
                    className={`overflow-hidden rounded-md border text-left transition ${
                      active
                        ? "border-(--amber) bg-(--amber)/10 shadow-[0_0_0_1px_var(--amber)]"
                        : "border-(--line) bg-(--bg-2) hover:border-(--amber)/45"
                    }`}
                    key={mediaId}
                    onClick={() => selectAsset(mediaId)}
                    type="button"
                  >
                    <div className="relative aspect-video w-full bg-(--bg-3)">
                      {src ? <img alt="" className="h-full w-full object-cover" src={src} /> : null}
                      <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white">
                        {item.kind.includes("video") ? "MP4" : "IMG"}
                      </span>
                    </div>
                    <div className="truncate px-2 py-2 font-mono text-[12px] text-(--text-2)">{item.filename}</div>
                  </button>
                );
              })}
            </div>

            <p className="font-mono text-sm text-(--text-3)">
              Current watermark: {selected ? `${selected.filename} / ${selected.kind.includes("video") ? "video overlay" : "image overlay"}.` : "none"}
            </p>
          </div>

          <footer className="flex justify-end border-t border-(--line) px-6 py-4">
            <Button onClick={onClose} variant="primary">Done</Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function isWatermarkMedia(item: EditorMediaItem): item is WatermarkMedia {
  return item.kind === "image" || item.kind === "video" || item.kind === "watermark_image" || item.kind === "watermark_video";
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
    mediaId,
    opacity: 85,
    posX: 9,
    posY: 11,
    scale: 0.08,
  };
}
