import { ImageIcon, PlusCircle, Trash, Type, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Project } from "@vc/shared-schemas";
import { Button, NumberInput, Select } from "@/components/ui";
import { WatermarkPanel } from "@/components/watermark-panel/WatermarkPanel";
import { formatImageMeta, formatTimecode } from "@/lib/format";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { EditorMediaItem, EditorSelection } from "./types";

type InspectorProps = {
  layers: Layer[];
  media: EditorMediaItem[];
  onDeleteItem: (layerId: string, itemId: string) => void;
  onOpenAssignEdit: (layerId: string, itemId: string, range: [number, number]) => void;
  onOpenBackground: () => void;
  onOpenSubtitles: () => void;
  onPatchBackground: (
    layerId: string,
    patch: {
      crossfade?: number;
      motion?: Partial<{ easing: string; kind: string }>;
    },
  ) => void;
  onPatchItem: (
    layerId: string,
    itemId: string,
    patch: {
      mediaId?: string;
      motion?: Partial<{ easing: string; kind: string }>;
      pip?: Partial<{ opacity: number; posX: number; posY: number; radius: number; size: number }>;
      transitions?: Partial<{ in: string; out: string }>;
    },
  ) => void;
  onRemoveBackground: (layerId: string) => void;
  onUpdateRange: (layerId: string, itemId: string, range: [number, number]) => void;
  onWatermarkChange: (watermark: Project["watermark"]) => void;
  projectPath: string;
  selected: EditorSelection;
  subtitles: Project["subtitles"];
  watermark: Project["watermark"];
};

type VisualItem = {
  id: string;
  end: number;
  mediaId: string;
  motion: { kind: string; easing: string };
  sentences: [number, number];
  start: number;
  transitions: { in: string; out: string };
};

type PipVisualItem = VisualItem & {
  pip: {
    opacity: number;
    posX: number;
    posY: number;
    radius: number;
    size: number;
  };
};

type BackgroundVisualItem = VisualItem & {
  crossfade: number;
};

type PipPlacement = "TL" | "TC" | "TR" | "ML" | "MC" | "MR" | "BL" | "BC" | "BR";

const motionOptions = [
  { label: "none", value: "none" },
  { label: "ken_burns", value: "ken_burns" },
  { label: "ken_burns_strong", value: "ken_burns_strong" },
  { label: "zoom_in", value: "zoom_in" },
  { label: "zoom_out", value: "zoom_out" },
  { label: "pan_left", value: "pan_left" },
  { label: "pan_right", value: "pan_right" },
];
const backgroundMotionOptions = [
  { label: "none", value: "none" },
  { label: "ken_burns_subtle", value: "ken_burns_subtle" },
  { label: "ken_burns_strong", value: "ken_burns_strong" },
  { label: "zoom_in", value: "zoom_in" },
  { label: "zoom_out", value: "zoom_out" },
  { label: "pan_left", value: "pan_left" },
  { label: "pan_right", value: "pan_right" },
];
const easingOptions = [
  { label: "linear", value: "linear" },
  { label: "ease_in", value: "ease_in" },
  { label: "ease_out", value: "ease_out" },
  { label: "ease_in_out", value: "ease_in_out" },
];
const transitionOptions = [
  { label: "cut", value: "cut" },
  { label: "fade", value: "fade" },
  { label: "slide_left", value: "slide_left" },
  { label: "slide_right", value: "slide_right" },
  { label: "dip_black", value: "dip_black" },
];
const pipPlacements: PipPlacement[] = ["TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"];
const inspectorControlClass = "rounded-none border-0 bg-(--bg-2) hover:bg-(--bg-2) focus:border-transparent focus-visible:outline-offset-0";

export function Inspector({
  layers,
  media,
  onDeleteItem,
  onOpenAssignEdit,
  onOpenBackground,
  onOpenSubtitles,
  onPatchBackground,
  onPatchItem,
  onRemoveBackground,
  onUpdateRange,
  onWatermarkChange,
  projectPath,
  selected,
  subtitles,
  watermark,
}: InspectorProps) {
  const t = useTranslations("pages.editor.inspector");
  const backgroundLayer = layers.find((entry) => entry.kind === "bg");
  const hasBackground = !!backgroundLayer;
  const fallbackSelection = defaultSelection(layers);
  const effectiveSelection = selected ?? fallbackSelection;
  const layer = effectiveSelection ? layers.find((entry) => entry.id === effectiveSelection.layerId) : undefined;
  const selectedItem = effectiveSelection && layer ? layer.items.find((entry) => hasId(entry) && entry.id === effectiveSelection.itemId) : undefined;
  const fallbackItem = layer?.kind === "bg" ? layer.items[0] : undefined;
  const item = selectedItem ?? fallbackItem;

  if (!layer || !isVisualItem(item)) {
    return (
      <aside className="flex flex-col bg-(--bg-1)">
        <Header label={t("title")} />
        <GlobalControls
          hasBackground={hasBackground}
          media={media}
          onOpenBackground={onOpenBackground}
          onOpenSubtitles={onOpenSubtitles}
          onWatermarkChange={onWatermarkChange}
          subtitles={subtitles}
          watermark={watermark}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-(--text-3)">
          <p className="text-sm">{t("empty")}</p>
          <p className="text-[11px]">{t("emptyHint")}</p>
        </div>
      </aside>
    );
  }

  const asset = media.find((entry) => entry.filename === item.mediaId || entry.mediaId === item.mediaId);
  const isBackground = layer.kind === "bg";
  const isPip = layer.kind === "pip" && isPipItem(item);
  const bgAssets = backgroundAssets(media);
  const assetSrc = asset ? mediaSrc(projectPath, asset) : null;
  const placement = isPip ? placementFromCoords(item.pip.posX, item.pip.posY) : "MC";
  const edgeMarginX = isPip ? edgeMarginXFromPlacement(placement, item.pip.posX) : 0;
  const edgeMarginY = isPip ? edgeMarginYFromPlacement(placement, item.pip.posY) : 0;
  const availableMotionOptions = isBackground ? backgroundMotionOptions : motionOptions;

  return (
    <aside className="flex min-h-0 flex-col bg-(--bg-1)">
      <Header label={t("title")} />
      <GlobalControls
        hasBackground={hasBackground}
        media={media}
        onOpenBackground={onOpenBackground}
        onOpenSubtitles={onOpenSubtitles}
        onWatermarkChange={onWatermarkChange}
        subtitles={subtitles}
        watermark={watermark}
      />
      <section className="flex flex-col gap-3 border-b border-(--line-soft) px-[14px] py-[14px]">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-2)">
          {layerHeading(layer)}
        </h4>
        <button
          className="group flex w-full items-center gap-[10px] rounded-md border border-(--line) bg-(--bg-2) p-2 text-left hover:border-(--bg-5)"
          onClick={() => {
            if (isBackground) {
              onOpenBackground();
              return;
            }
            onOpenAssignEdit(layer.id, item.id, item.sentences);
          }}
          title={t("change")}
          type="button"
        >
          <div className="h-8 w-14 overflow-hidden rounded-sm bg-(--bg-3)">
            {assetSrc ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                src={assetSrc}
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-(--text)">{item.mediaId}</div>
            <div className="truncate font-mono text-[10.5px] text-(--text-3)">
              {isBackground && asset ? formatImageMeta(asset.width ?? 0, asset.height ?? 0, asset.size) : itemSummary(item)}
            </div>
          </div>
          <span className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3) group-hover:text-(--text-2)">
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
            {t("change")}
          </span>
        </button>
        {isBackground ? <p className="text-[11px] leading-snug text-(--text-3)">{t("bgHint")}</p> : null}
      </section>

      {isPip ? (
        <Section title="Placement">
          <div className="col-span-2 grid h-[90px] w-[160px] grid-cols-3 gap-1 rounded border border-(--line) bg-(--bg-2) p-1">
            {pipPlacements.map((value) => (
              <button
                aria-label={`PiP placement ${value}`}
                className={`h-full rounded-[3px] border font-mono text-[9px] ${placement === value ? "border-(--amber) bg-(--amber) text-(--bg-0) font-semibold" : "border-(--line-soft) bg-(--bg-3) text-(--text-3) hover:bg-(--bg-4) hover:text-(--text-2)"}`}
                key={value}
                onClick={() => {
                  const nextPos = positionFromPlacement(value, edgeMarginX, edgeMarginY);
                  onPatchItem(layer.id, item.id, { pip: { posX: nextPos.posX, posY: nextPos.posY } });
                }}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
          <div className="col-span-2 grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-2 text-[11px]">
            <span className="text-(--text-3)">Size</span>
            <div className="flex items-center">
              <input
                aria-label={t("pipSize")}
                className="h-2 w-full accent-(--amber)"
                id="editor-pip-size"
                max={60}
                min={15}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onPatchItem(layer.id, item.id, { pip: { size: clamp(next, 15, 60) } });
                }}
                step={1}
                type="range"
                value={item.pip.size}
              />
            </div>
            <span className="text-right font-mono text-[11px] text-(--text-2)">{Math.round(item.pip.size)}%</span>
          </div>
          <div className="col-span-2 grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-2 text-[11px]">
            <span className="text-(--text-3)">Radius</span>
            <div className="flex items-center">
              <input
                aria-label={t("pipRadius")}
                className="h-2 w-full accent-(--amber)"
                id="editor-pip-radius"
                max={32}
                min={0}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onPatchItem(layer.id, item.id, { pip: { radius: clamp(next, 0, 32) } });
                }}
                step={1}
                type="range"
                value={item.pip.radius}
              />
            </div>
            <span className="text-right font-mono text-[11px] text-(--text-2)">{Math.round(item.pip.radius)}px</span>
          </div>
          <div className="col-span-2 grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-2 text-[11px]">
            <span className="text-(--text-3)">Opacity</span>
            <div className="flex items-center">
              <input
                aria-label={t("pipOpacity")}
                className="h-2 w-full accent-(--amber)"
                id="editor-pip-opacity"
                max={100}
                min={10}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onPatchItem(layer.id, item.id, { pip: { opacity: clamp(next, 10, 100) } });
                }}
                step={1}
                type="range"
                value={item.pip.opacity}
              />
            </div>
            <span className="text-right font-mono text-[11px] text-(--text-2)">{Math.round(item.pip.opacity)}%</span>
          </div>
        </Section>
      ) : null}

      {!isBackground ? (
        <Section title={t("range")}>
          <GridRow htmlFor="editor-range-from" label="From">
            <NumberInput
              aria-label={t("rangeFrom")}
              className={inspectorControlClass}
              id="editor-range-from"
              min={1}
              name="editor-range-from"
              onChange={(event) => {
                const nextFrom = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(nextFrom)) return;
                onUpdateRange(layer.id, item.id, [Math.max(1, nextFrom), Math.max(Math.max(1, nextFrom), item.sentences[1])]);
              }}
              value={item.sentences[0]}
            />
          </GridRow>
          <GridRow htmlFor="editor-range-to" label="To">
            <NumberInput
              aria-label={t("rangeTo")}
              className={inspectorControlClass}
              id="editor-range-to"
              min={item.sentences[0]}
              name="editor-range-to"
              onChange={(event) => {
                const nextTo = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(nextTo)) return;
                const normalizedTo = Math.max(1, nextTo);
                onUpdateRange(layer.id, item.id, [Math.min(item.sentences[0], normalizedTo), normalizedTo]);
              }}
              value={item.sentences[1]}
            />
          </GridRow>
          {layer.kind === "fg" ? (
            <GridRow label={t("stretch")}><span className="font-mono text-[11px] text-(--text-3)">{t("stretchHint")}</span></GridRow>
          ) : null}
        </Section>
      ) : null}

      <Section title={t("motion")}>
        <GridRow htmlFor={isBackground ? "editor-motion-kind" : undefined} label={isBackground ? t("backgroundMotion") : "Motion"}>
          <Select
            aria-label={isBackground ? t("backgroundMotion") : layer.kind === "pip" ? t("pipMotion") : t("foregroundMotion")}
            className={inspectorControlClass}
            id="editor-motion-kind"
            name="editor-motion-kind"
            onChange={(event) => {
              const nextKind = persistedMotionKind(event.target.value);
              if (isBackground) {
                onPatchBackground(layer.id, { motion: { kind: nextKind } });
                return;
              }
              onPatchItem(layer.id, item.id, { motion: { kind: nextKind } });
            }}
            value={normalizeMotionKind(item.motion.kind, isBackground)}
          >
            {availableMotionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </GridRow>
        {isBackground ? (
          <GridRow htmlFor="editor-motion-easing" label={t("backgroundEasing")}>
            <Select
              aria-label={t("backgroundEasing")}
              className={inspectorControlClass}
              id="editor-motion-easing"
              name="editor-motion-easing"
              onChange={(event) => {
                onPatchBackground(layer.id, { motion: { easing: event.target.value } });
              }}
              value={item.motion.easing}
            >
              {easingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </GridRow>
        ) : null}
      </Section>

      {!isBackground ? (
        <Section title={t("easing")}>
          <GridRow htmlFor="editor-motion-easing" label={t("easing")}>
            <Select
              aria-label={t("easing")}
              className={inspectorControlClass}
              id="editor-motion-easing"
              name="editor-motion-easing"
              onChange={(event) => {
                onPatchItem(layer.id, item.id, { motion: { easing: event.target.value } });
              }}
              value={item.motion.easing}
            >
              {easingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </GridRow>
        </Section>
      ) : null}

      {!isBackground ? (
        <Section title={t("transitions")}>
          <GridRow htmlFor="editor-transition-in" label="In">
            <Select
              aria-label={t("transitionIn")}
              className={inspectorControlClass}
              id="editor-transition-in"
              name="editor-transition-in"
              onChange={(event) => onPatchItem(layer.id, item.id, { transitions: { in: event.target.value } })}
              value={item.transitions.in}
            >
              {transitionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </GridRow>
          <GridRow htmlFor="editor-transition-out" label="Out">
            <Select
              aria-label={t("transitionOut")}
              className={inspectorControlClass}
              id="editor-transition-out"
              name="editor-transition-out"
              onChange={(event) => onPatchItem(layer.id, item.id, { transitions: { out: event.target.value } })}
              value={item.transitions.out}
            >
              {transitionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </GridRow>
        </Section>
      ) : null}

      {isBackground ? (
        <Section title={t("backgroundCycle")}>
          <div className="col-span-2 grid grid-cols-3 gap-2">
            {bgAssets.map((entry) => (
              <div className="min-w-0 overflow-hidden rounded border border-(--line) bg-(--bg-2)" key={entry.filename}>
                {mediaSrc(projectPath, entry) ? (
                  <img
                    alt={entry.filename}
                    className="aspect-video w-full object-cover"
                    src={mediaSrc(projectPath, entry) ?? undefined}
                  />
                ) : (
                  <div aria-hidden="true" className="aspect-video w-full bg-(--bg-3)" />
                )}
                <div className="truncate px-1.5 py-1 font-mono text-[10px] text-(--text-3)">{entry.filename}</div>
              </div>
            ))}
          </div>
          <GridRow htmlFor="editor-bg-crossfade" label={t("backgroundCrossfade")}>
            <NumberInput
              id="editor-bg-crossfade"
              className={inspectorControlClass}
              max={2}
              min={0}
              name="editor-bg-crossfade"
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                if (!Number.isFinite(next)) return;
                onPatchBackground(layer.id, { crossfade: clamp(next, 0, 2) });
              }}
              step={0.1}
              value={isBackgroundItem(item) ? item.crossfade : 0}
            />
          </GridRow>
        </Section>
      ) : null}

      <Button
        className="mx-4 my-3 justify-start"
        onClick={() => {
          if (isBackground) {
            onRemoveBackground(layer.id);
            return;
          }
          onDeleteItem(layer.id, item.id);
        }}
        variant="ghost"
      >
        <Trash aria-hidden="true" className="h-4 w-4 text-(--red)" />
        {isBackground ? t("removeBg") : isPip ? t("deletePipItem") : t("deleteItem")}
      </Button>
    </aside>
  );
}

function defaultSelection(layers: Layer[]): EditorSelection {
  const background = layers.find((layer) => layer.kind === "bg");
  const backgroundItem = background?.items.find(hasId);
  if (background && backgroundItem) {
    return { layerId: background.id, itemId: backgroundItem.id };
  }
  for (const layer of layers) {
    if (layer.kind === "sub") continue;
    const item = layer.items.find(hasId);
    if (item) return { layerId: layer.id, itemId: item.id };
  }
  return null;
}

function hasId(item: unknown): item is { id: string } {
  return typeof item === "object" && item !== null && "id" in item && typeof item.id === "string";
}

function isVisualItem(item: unknown): item is VisualItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    "mediaId" in item &&
    typeof item.mediaId === "string" &&
    "start" in item &&
    typeof item.start === "number" &&
    "end" in item &&
    typeof item.end === "number" &&
    "sentences" in item &&
    Array.isArray(item.sentences) &&
    "motion" in item &&
    typeof item.motion === "object" &&
    "transitions" in item &&
    typeof item.transitions === "object"
  );
}

function isPipItem(item: VisualItem): item is PipVisualItem {
  return "pip" in item && typeof item.pip === "object" && item.pip !== null;
}

function isBackgroundItem(item: VisualItem): item is BackgroundVisualItem {
  return "crossfade" in item && typeof item.crossfade === "number";
}

function layerHeading(layer: Layer): string {
  if (layer.kind === "bg") return "Background";
  if (layer.kind === "pip") {
    if (/^PiP\s+z\d+/i.test(layer.name)) {
      return `PiP · ${layer.name.replace(/^PiP\s+/i, "")}`;
    }
    return `PiP · ${layer.name}`;
  }
  if (/^Foreground\s+z\d+/i.test(layer.name)) {
    return `Foreground · ${layer.name.replace(/^Foreground\s+/i, "")}`;
  }
  return `Foreground · ${layer.name}`;
}

function itemSummary(item: VisualItem): string {
  const range = `s${item.sentences[0]}-s${item.sentences[1]}`;
  const span = `${formatTimecode(item.start)}-${formatTimecode(item.end)}`;
  return `${range} · ${span}`;
}

function backgroundAssets(media: EditorMediaItem[]): EditorMediaItem[] {
  const assets = media.filter((entry) => /^bg\d+\./i.test(entry.filename) || entry.filename.toLowerCase().includes("background"));
  return assets.length > 0 ? assets : media.filter((entry) => entry.kind === "image");
}

function mediaSrc(projectPath: string, item: EditorMediaItem): string | null {
  if (item.thumb_url) return `/api/server${item.thumb_url}`;
  if (item.path.startsWith("uploads/")) {
    return `/api/server/uploads/media-file?filename=${encodeURIComponent(item.mediaId)}`;
  }
  if (!projectPath) return null;
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.filename)}`;
}

function Header({ label }: { label: string }) {
  return (
    <div className="sticky top-0 flex h-[34px] items-center justify-center border-b border-(--amber) px-4 text-[12px] font-semibold uppercase text-(--text)">
      {label}
    </div>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-3 border-b border-(--line-soft) px-[14px] py-[14px] last:border-b-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-2)">{title}</h4>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-[10px] gap-y-2 text-xs">{children}</div>
    </section>
  );
}

function GridRow({ children, htmlFor, label }: { children: ReactNode; htmlFor?: string; label: string }) {
  return (
    <>
      {htmlFor ? (
        <label className="text-[10.5px] uppercase tracking-[0.06em] text-(--text-3)" htmlFor={htmlFor}>{label}</label>
      ) : (
        <span className="text-[10.5px] uppercase tracking-[0.06em] text-(--text-3)">{label}</span>
      )}
      <span>{children}</span>
    </>
  );
}

function GlobalControls({
  hasBackground,
  media,
  onOpenBackground,
  onOpenSubtitles,
  onWatermarkChange,
  subtitles,
  watermark,
}: {
  hasBackground: boolean;
  media: EditorMediaItem[];
  onOpenBackground: () => void;
  onOpenSubtitles: () => void;
  onWatermarkChange: (watermark: Project["watermark"]) => void;
  subtitles: Project["subtitles"];
  watermark: Project["watermark"];
}) {
  const t = useTranslations("pages.editor.inspector");
  const watermarkMedia = media
    .filter(
      (
        item,
      ): item is EditorMediaItem & { kind: "image" | "video" | "watermark_image" | "watermark_video" } =>
        item.kind === "image" ||
        item.kind === "video" ||
        item.kind === "watermark_image" ||
        item.kind === "watermark_video",
    )
    .map((item) => ({
      mediaId: item.mediaId || item.filename,
      filename: item.filename,
      kind: item.kind,
      thumb_url: item.thumb_url,
    }));
  const watermarkLabel = watermark?.mediaId ?? "Choose";
  const firstWatermarkAsset = watermarkMedia[0];
  return (
    <section className="border-b border-(--line-soft) px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">Global video config</span>
        <span className="rounded-full border border-(--blue) px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-(--blue)">SQLite</span>
      </div>
      <div className="grid gap-2">
        <button
          aria-label="Watermark"
          className="flex w-full items-center justify-between gap-[10px] rounded border border-(--amber)/35 bg-(--amber)/10 px-[10px] py-2 text-[12px]"
          onClick={() => {
            if (watermark) {
              onWatermarkChange(null);
              return;
            }
            if (!firstWatermarkAsset) return;
            onWatermarkChange({
              mediaId: firstWatermarkAsset.mediaId,
              opacity: 85,
              posX: 9,
              posY: 11,
              scale: 0.08,
            });
          }}
          type="button"
        >
          <span className="inline-flex items-center gap-[7px] text-(--text-2)"><ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />Watermark</span>
          <span className="font-mono text-[10.5px] text-(--text-4)">{watermarkLabel}</span>
        </button>
        <button
          aria-label={t("subtitles")}
          className="flex w-full items-center justify-between gap-[10px] rounded border border-(--line) bg-(--bg-2) px-[10px] py-2 text-[12px]"
          onClick={onOpenSubtitles}
          type="button"
        >
          <span className="inline-flex items-center gap-[7px] text-(--text-2)"><Type aria-hidden="true" className="h-3.5 w-3.5" />{t("subtitles")}</span>
          <span className="font-mono text-[10.5px] text-(--text-4)">{subtitles?.burn_in ? t("subtitlesVisible") : t("subtitlesHidden")}</span>
        </button>
        <button
          aria-label={hasBackground ? t("changeBackground") : t("addBackground")}
          className="flex w-full items-center justify-between gap-[10px] rounded border border-(--line) bg-(--bg-2) px-[10px] py-2 text-[12px]"
          onClick={onOpenBackground}
          type="button"
        >
          <span className="inline-flex items-center gap-[7px] text-(--text-2)"><PlusCircle aria-hidden="true" className="h-3.5 w-3.5" />{hasBackground ? t("changeBackground") : t("addBackground")}</span>
          <span className="font-mono text-[10.5px] text-(--text-4)">Choose</span>
        </button>
      </div>
      <div className="sr-only">
        <WatermarkPanel media={watermarkMedia} onChange={onWatermarkChange} value={watermark ?? null} />
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMotionKind(kind: string, isBackground: boolean): string {
  if (!isBackground) {
    if (kind === "ken_burns_subtle") return "ken_burns";
    return kind;
  }
  if (kind === "ken_burns_subtle") return "ken_burns_subtle";
  if (kind === "ken_burns") return "ken_burns_subtle";
  return kind;
}

function persistedMotionKind(kind: string): string {
  if (kind === "ken_burns_subtle") return "ken_burns";
  return kind;
}

function placementFromCoords(posX: number, posY: number): PipPlacement {
  const row = posY < 34 ? "T" : posY >= 66 ? "B" : "M";
  const col = posX < 34 ? "L" : posX >= 66 ? "R" : "C";
  return `${row}${col}` as PipPlacement;
}

function edgeMarginXFromPlacement(placement: PipPlacement, posX: number): number {
  if (placement.endsWith("L")) return Math.round(posX);
  if (placement.endsWith("R")) return Math.round(100 - posX);
  return 0;
}

function edgeMarginYFromPlacement(placement: PipPlacement, posY: number): number {
  if (placement.startsWith("T")) return Math.round(posY);
  if (placement.startsWith("B")) return Math.round(100 - posY);
  return 0;
}

function positionFromPlacement(placement: PipPlacement, marginX: number, marginY: number): { posX: number; posY: number } {
  const x = placement.endsWith("L") ? marginX : placement.endsWith("R") ? 100 - marginX : 50;
  const y = placement.startsWith("T") ? marginY : placement.startsWith("B") ? 100 - marginY : 50;
  return { posX: clamp(x, 0, 100), posY: clamp(y, 0, 100) };
}
