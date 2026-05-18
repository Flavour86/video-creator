import { Trash, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Project } from "@vc/shared-schemas";
import { Button, NumberInput, Select } from "@/components/ui";
import { WatermarkPanel } from "@/components/watermark-panel/WatermarkPanel";
import { formatImageMeta, formatRangeLabel, formatTimecode } from "@/lib/format";
import type { Layer } from "@/lib/preview/resolveDisplay";
import Image from "next/image";
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
  const placement = isPip ? placementFromCoords(item.pip.posX, item.pip.posY) : "MC";
  const edgeMarginX = isPip ? edgeMarginXFromPlacement(placement, item.pip.posX) : 0;
  const edgeMarginY = isPip ? edgeMarginYFromPlacement(placement, item.pip.posY) : 0;
  const rangeLabel = formatRangeLabel(item.sentences[0], item.sentences[1]);
  const timeLabel = `${formatTimecode(item.start)}-${formatTimecode(item.end)}`;
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
      <section className="flex flex-col gap-3 border-b border-(--line-soft) px-4 py-4">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">
          {layerHeading(layer)}
        </h4>
        <button
          className="group flex w-full items-center gap-3 rounded-md border border-(--line) bg-(--bg-2) p-3 text-left hover:border-(--bg-5)"
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
          <div className="h-10 w-10 overflow-hidden rounded-sm bg-(--bg-3)">
            {asset ? <Image alt="" className="h-full w-full object-cover" src={mediaSrc(projectPath, asset)} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm text-(--text)">{item.mediaId}</div>
            <div className="truncate font-mono text-[11px] text-(--text-3)">
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

      {!isBackground ? (
        <Section title={t("range")}>
          <GridRow htmlFor="editor-range-from" label={t("rangeFrom")}>
            <NumberInput
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
          <GridRow htmlFor="editor-range-to" label={t("rangeTo")}>
            <NumberInput
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
          <GridRow label={t("resolvedTimeSpan")}>
            <span className="font-mono text-[11px] text-(--text-3)">{`${rangeLabel} (${timeLabel})`}</span>
          </GridRow>
          <GridRow label={t("stretch")}><span className="font-mono text-[11px] text-(--text-3)">{t("stretchHint")}</span></GridRow>
        </Section>
      ) : null}

      <Section title={t("motion")}>
        <GridRow htmlFor="editor-motion-kind" label={isBackground ? t("backgroundMotion") : layer.kind === "pip" ? t("pipMotion") : t("foregroundMotion")}>
          <Select
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
        <GridRow htmlFor="editor-motion-easing" label={isBackground ? t("backgroundEasing") : t("motionEasing")}>
          <Select
            id="editor-motion-easing"
            name="editor-motion-easing"
            onChange={(event) => {
              if (isBackground) {
                onPatchBackground(layer.id, { motion: { easing: event.target.value } });
                return;
              }
              onPatchItem(layer.id, item.id, { motion: { easing: event.target.value } });
            }}
            value={item.motion.easing}
          >
            {easingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </GridRow>
      </Section>

      {isPip ? (
        <Section title={t("pipPlacement")}>
          <GridRow htmlFor="editor-pip-placement" label={t("pipPlacementLabel")}>
            <Select
              id="editor-pip-placement"
              name="editor-pip-placement"
              onChange={(event) => {
                const nextPlacement = event.target.value as PipPlacement;
                const nextPos = positionFromPlacement(nextPlacement, edgeMarginX, edgeMarginY);
                onPatchItem(layer.id, item.id, { pip: { posX: nextPos.posX, posY: nextPos.posY } });
              }}
              value={placement}
            >
              {pipPlacements.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </GridRow>
          <GridRow htmlFor="editor-pip-margin-x" label={t("edgeMarginX")}>
            <NumberInput
              id="editor-pip-margin-x"
              max={40}
              min={0}
              name="editor-pip-margin-x"
              onChange={(event) => {
                const nextMarginX = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(nextMarginX)) return;
                const nextPos = positionFromPlacement(placement, clamp(nextMarginX, 0, 40), edgeMarginY);
                onPatchItem(layer.id, item.id, { pip: { posX: nextPos.posX } });
              }}
              value={edgeMarginX}
            />
          </GridRow>
          <GridRow htmlFor="editor-pip-margin-y" label={t("edgeMarginY")}>
            <NumberInput
              id="editor-pip-margin-y"
              max={40}
              min={0}
              name="editor-pip-margin-y"
              onChange={(event) => {
                const nextMarginY = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(nextMarginY)) return;
                const nextPos = positionFromPlacement(placement, edgeMarginX, clamp(nextMarginY, 0, 40));
                onPatchItem(layer.id, item.id, { pip: { posY: nextPos.posY } });
              }}
              value={edgeMarginY}
            />
          </GridRow>
          <GridRow htmlFor="editor-pip-size" label={t("pipSize")}>
            <NumberInput
              id="editor-pip-size"
              max={60}
              min={15}
              name="editor-pip-size"
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                if (!Number.isFinite(next)) return;
                onPatchItem(layer.id, item.id, { pip: { size: clamp(next, 15, 60) } });
              }}
              value={item.pip.size}
            />
          </GridRow>
          <GridRow htmlFor="editor-pip-radius" label={t("pipRadius")}>
            <NumberInput
              id="editor-pip-radius"
              max={32}
              min={0}
              name="editor-pip-radius"
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                if (!Number.isFinite(next)) return;
                onPatchItem(layer.id, item.id, { pip: { radius: clamp(next, 0, 32) } });
              }}
              value={item.pip.radius}
            />
          </GridRow>
          <GridRow htmlFor="editor-pip-opacity" label={t("pipOpacity")}>
            <NumberInput
              id="editor-pip-opacity"
              max={100}
              min={10}
              name="editor-pip-opacity"
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                if (!Number.isFinite(next)) return;
                onPatchItem(layer.id, item.id, { pip: { opacity: clamp(next, 10, 100) } });
              }}
              value={item.pip.opacity}
            />
          </GridRow>
        </Section>
      ) : null}

      {isBackground ? (
        <Section title={t("backgroundCycle")}>
          <div className="col-span-2 grid grid-cols-3 gap-2">
            {bgAssets.map((entry) => (
              <div className="min-w-0 overflow-hidden rounded border border-(--line) bg-(--bg-2)" key={entry.filename}>
                <Image alt={entry.filename} className="aspect-video w-full object-cover" src={mediaSrc(projectPath, entry)} />
                <div className="truncate px-1.5 py-1 font-mono text-[10px] text-(--text-3)">{entry.filename}</div>
              </div>
            ))}
          </div>
          <GridRow htmlFor="editor-bg-crossfade" label={t("backgroundCrossfade")}>
            <NumberInput
              id="editor-bg-crossfade"
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

      {!isBackground ? (
        <Section title={t("transitions")}>
          <GridRow htmlFor="editor-transition-in" label={t("transitionIn")}>
            <Select
              id="editor-transition-in"
              name="editor-transition-in"
              onChange={(event) => onPatchItem(layer.id, item.id, { transitions: { in: event.target.value } })}
              value={item.transitions.in}
            >
              {transitionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </GridRow>
          <GridRow htmlFor="editor-transition-out" label={t("transitionOut")}>
            <Select
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
  const zone = layer.name.match(/z\d+/i)?.[0];
  if (layer.kind === "pip") return zone ? `PiP · ${zone}` : "PiP";
  return zone ? `Foreground · ${zone}` : "Foreground";
}

function itemSummary(item: VisualItem): string {
  return `range ${item.sentences[0]}-${item.sentences[1]} - motion ${item.motion.kind} - transition in ${item.transitions.in} - out ${item.transitions.out}`;
}

function backgroundAssets(media: EditorMediaItem[]): EditorMediaItem[] {
  const assets = media.filter((entry) => /^bg\d+\./i.test(entry.filename) || entry.filename.toLowerCase().includes("background"));
  return assets.length > 0 ? assets : media.filter((entry) => entry.kind === "image");
}

function mediaSrc(projectPath: string, item: EditorMediaItem): string {
  if (item.thumb_url) return `/api/server${item.thumb_url}`;
  if (item.path.startsWith("uploads/")) {
    return `/api/server/uploads/media-file?filename=${encodeURIComponent(item.mediaId)}`;
  }
  return `/api/server/projects/media-file?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(item.filename)}`;
}

function Header({ label }: { label: string }) {
  return <div className="sticky top-0 border-b border-(--line) px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">{label}</div>;
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-3 border-b border-(--line-soft) px-4 py-4 last:border-b-0">
      <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">{title}</h4>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs">{children}</div>
    </section>
  );
}

function GridRow({ children, htmlFor, label }: { children: ReactNode; htmlFor?: string; label: string }) {
  return (
    <>
      {htmlFor ? (
        <label className="uppercase tracking-[0.06em] text-(--text-3)" htmlFor={htmlFor}>{label}</label>
      ) : (
        <span className="uppercase tracking-[0.06em] text-(--text-3)">{label}</span>
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
    .filter((item) => item.kind === "image" || item.kind === "video" || item.kind === "watermark_image" || item.kind === "watermark_video")
    .map((item) => ({
      mediaId: item.mediaId || item.filename,
      filename: item.filename,
      kind: item.kind,
      thumb_url: item.thumb_url,
    }));

  return (
    <section className="border-b border-(--line-soft) px-4 py-3">
      <div className="grid gap-2">
        <WatermarkPanel media={watermarkMedia} onChange={onWatermarkChange} value={watermark} />
        <button
          className="w-full rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-left text-sm font-semibold hover:border-(--bg-5)"
          onClick={onOpenSubtitles}
          type="button"
        >
          {t("subtitles")}
        </button>
        <button
          className="w-full rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-left text-sm font-semibold hover:border-(--bg-5)"
          onClick={onOpenBackground}
          type="button"
        >
          {hasBackground ? t("changeBackground") : t("addBackground")}
        </button>
      </div>
      {subtitles ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-(--text-3)">
          {subtitles.burn_in ? t("subtitlesBurnInOn") : t("subtitlesSidecar")}
        </p>
      ) : null}
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
  const row = posY < 33 ? "T" : posY > 67 ? "B" : "M";
  const col = posX < 33 ? "L" : posX > 67 ? "R" : "C";
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
