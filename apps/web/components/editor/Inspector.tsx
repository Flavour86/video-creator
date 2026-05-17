import { Trash, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button, NumberInput, Select } from "@/components/ui";
import { formatImageMeta, formatRangeLabel } from "@/lib/format";
import type { Layer } from "@/lib/preview/resolveDisplay";
import Image from "next/image";
import type { EditorMediaItem, EditorSelection } from "./types";

type InspectorProps = {
  layers: Layer[];
  media: EditorMediaItem[];
  onOpenAssignEdit: (layerId: string, itemId: string, range: [number, number]) => void;
  onOpenBackground: () => void;
  onRemoveBackground: (layerId: string) => void;
  onOpenUpload: () => void;
  projectPath: string;
  selected: EditorSelection;
};

type VisualItem = {
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

const motionOptions = [
  { label: "none", value: "none" },
  { label: "Ken Burns · subtle", value: "ken_burns" },
  { label: "Ken Burns · strong", value: "ken_burns_strong" },
  { label: "Zoom in", value: "zoom_in" },
  { label: "Zoom out", value: "zoom_out" },
  { label: "Pan left", value: "pan_left" },
  { label: "Pan right", value: "pan_right" },
];
const easingOptions = [
  { label: "linear", value: "linear" },
  { label: "ease in", value: "ease_in" },
  { label: "ease out", value: "ease_out" },
  { label: "ease in-out", value: "ease_in_out" },
];
const transitionOptions = [
  { label: "cut", value: "cut" },
  { label: "fade", value: "fade" },
  { label: "slide left", value: "slide_left" },
  { label: "slide right", value: "slide_right" },
  { label: "dip to black", value: "dip_black" },
];

export function Inspector({
  layers,
  media,
  onOpenAssignEdit,
  onOpenBackground,
  onRemoveBackground,
  onOpenUpload,
  projectPath,
  selected,
}: InspectorProps) {
  const t = useTranslations("pages.editor.inspector");
  const backgroundLayer = layers.find((entry) => entry.kind === "bg");
  const hasBackground = !!backgroundLayer;
  const layer = selected ? layers.find((entry) => entry.id === selected.layerId) : layers.find((entry) => entry.kind === "bg");
  const selectedItem = selected && layer ? layer.items.find((entry) => hasId(entry) && entry.id === selected.itemId) : undefined;
  const item = selectedItem ?? (layer?.kind === "bg" ? layer.items[0] : undefined);

  if (!layer || !isVisualItem(item)) {
    return (
      <aside className="flex flex-col bg-(--bg-1)">
        <Header label={t("title")} />
        <section className="border-b border-(--line-soft) px-4 py-3">
          <button
            className="w-full rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-left text-sm font-semibold hover:border-(--bg-5)"
            onClick={onOpenBackground}
            type="button"
          >
            {hasBackground ? "Change Background" : "Add Background"}
          </button>
        </section>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-(--text-3)">
          <p className="text-sm">{t("empty")}</p>
          <p className="text-[11px]">{t("emptyHint")}</p>
        </div>
      </aside>
    );
  }

  const asset = media.find((entry) => entry.filename === item.mediaId);
  const range: [number, number] = item.sentences;
  const isBackground = layer.kind === "bg";
  const bgAssets = backgroundAssets(media);

  return (
    <aside className="flex min-h-0 flex-col bg-(--bg-1)">
      <Header label={t("title")} />
      <section className="border-b border-(--line-soft) px-4 py-3">
        <button
          className="w-full rounded border border-(--line) bg-(--bg-2) px-3 py-2 text-left text-sm font-semibold hover:border-(--bg-5)"
          onClick={onOpenBackground}
          type="button"
        >
          {hasBackground ? "Change Background" : "Add Background"}
        </button>
      </section>
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
            if (hasId(item)) {
              onOpenAssignEdit(layer.id, item.id, range);
              return;
            }
            onOpenUpload();
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
          <GridRow label={t("from")}><NumberInput id="editor-range-from" min={1} name="editor-range-from" value={range[0]} readOnly /></GridRow>
          <GridRow label={t("to")}><NumberInput id="editor-range-to" min={range[0]} name="editor-range-to" value={range[1]} readOnly /></GridRow>
          <GridRow label={t("stretch")}><span className="font-mono text-[11px] text-(--text-3)">{t("stretchHint")}</span></GridRow>
        </Section>
      ) : null}
      <Section title={t("motion")}>
        <GridRow label={t("kind")}><Select defaultValue={item.motion.kind} id="editor-motion-kind" name="editor-motion-kind">{motionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></GridRow>
        {!isBackground ? <GridRow label={t("easing")}><Select defaultValue={item.motion.easing} id="editor-motion-easing" name="editor-motion-easing">{easingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></GridRow> : null}
      </Section>
      {isPipItem(item) ? (
        <Section title={t("pipPlacement")}>
          <p className="col-span-2 font-mono text-[11px] text-(--text-2)">{pipSummary(item)}</p>
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
          {isBackgroundItem(item) ? <p className="col-span-2 font-mono text-[11px] text-(--text-2)">Crossfade {item.crossfade}s</p> : null}
        </Section>
      ) : null}
      {!isBackground ? (
        <Section title={t("transitions")}>
          <GridRow label={t("in")}><Select defaultValue={item.transitions.in} id="editor-transition-in" name="editor-transition-in">{transitionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></GridRow>
          <GridRow label={t("out")}><Select defaultValue={item.transitions.out} id="editor-transition-out" name="editor-transition-out">{transitionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></GridRow>
        </Section>
      ) : null}
      <Button
        className="mx-4 my-3 justify-start"
        onClick={() => {
          if (isBackground) {
            onRemoveBackground(layer.id);
            return;
          }
        }}
        variant="ghost"
      >
        <Trash aria-hidden="true" className="h-4 w-4 text-(--red)" />
        {isBackground ? t("removeBg") : t("deleteItem")}
      </Button>
    </aside>
  );
}

function hasId(item: unknown): item is { id: string } {
  return typeof item === "object" && item !== null && "id" in item && typeof item.id === "string";
}

function isVisualItem(item: unknown): item is VisualItem {
  return (
    typeof item === "object" &&
    item !== null &&
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
  return `range ${item.sentences[0]}-${item.sentences[1]} · motion ${item.motion.kind} · transitions in: ${item.transitions.in} · out: ${item.transitions.out}`;
}

function pipSummary(item: PipVisualItem): string {
  return `posX ${item.pip.posX} · posY ${item.pip.posY} · size ${item.pip.size} · radius ${item.pip.radius} · opacity ${item.pip.opacity}`;
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

function GridRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <span className="uppercase tracking-[0.06em] text-(--text-3)">{label}</span>
      <span>{children}</span>
    </>
  );
}
