import { Trash, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button, NumberInput, Select } from "@/components/ui";
import { formatImageMeta, formatRangeLabel } from "@/lib/format";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { EditorMediaItem, EditorSelection } from "./types";

type InspectorProps = {
  layers: Layer[];
  media: EditorMediaItem[];
  onOpenBackground: () => void;
  onOpenUpload: () => void;
  selected: EditorSelection;
};

const motionOptions = ["None \u2014 static", "Ken Burns \u00b7 subtle", "Ken Burns \u00b7 strong", "Zoom in", "Zoom out", "Pan left", "Pan right"];
const easingOptions = ["linear", "ease in", "ease out", "ease in-out"];
const transitionOptions = ["cut", "fade \u00b7 0.4s", "slide left", "slide right", "dip to black"];

export function Inspector({ layers, media, onOpenBackground, onOpenUpload, selected }: InspectorProps) {
  const t = useTranslations("pages.editor.inspector");
  const layer = selected ? layers.find((entry) => entry.id === selected.layerId) : layers.find((entry) => entry.kind === "bg");
  const selectedItem = selected && layer ? layer.items.find((entry) => hasId(entry) && entry.id === selected.itemId) : undefined;
  const item = selectedItem ?? (layer?.kind === "bg" ? layer.items[0] : undefined);

  if (!layer || !isVisualItem(item)) {
    return (
      <aside className="flex flex-col bg-(--bg-1)">
        <Header label={t("title")} />
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

  return (
    <aside className="flex min-h-0 flex-col bg-(--bg-1)">
      <Header label={t("title")} />
      <section className="flex flex-col gap-3 border-b border-(--line-soft) px-4 py-4">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-2)">
          {isBackground ? t("background") : `Foreground \u00b7 ${layer.name}`}
        </h4>
        <button
          className="group flex w-full items-center gap-3 rounded-md border border-(--line) bg-(--bg-2) p-3 text-left hover:border-(--bg-5)"
          onClick={isBackground ? onOpenBackground : onOpenUpload}
          title={t("change")}
          type="button"
        >
          <div className="h-10 w-10 overflow-hidden rounded-sm bg-(--bg-3)">
            {asset?.thumb_url ? <img alt="" className="h-full w-full object-cover" src={`/api/server${asset.thumb_url}`} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm text-(--text)">{item.mediaId}</div>
            <div className="truncate font-mono text-[11px] text-(--text-3)">
              {isBackground && asset ? formatImageMeta(4032, 2688, asset.size) : `${formatRangeLabel(range[0], range[1])} \u00b7 ${Math.round(item.start)}-${Math.round(item.end)}s`}
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
        <GridRow label={t("kind")}><Select defaultValue={motionOptions[0]} id="editor-motion-kind" name="editor-motion-kind">{motionOptions.map((option) => <option key={option}>{option}</option>)}</Select></GridRow>
        {!isBackground ? <GridRow label={t("easing")}><Select defaultValue="ease in-out" id="editor-motion-easing" name="editor-motion-easing">{easingOptions.map((option) => <option key={option}>{option}</option>)}</Select></GridRow> : null}
      </Section>
      {!isBackground ? (
        <Section title={t("transitions")}>
          <GridRow label={t("in")}><Select defaultValue={transitionOptions[1]} id="editor-transition-in" name="editor-transition-in">{transitionOptions.map((option) => <option key={option}>{option}</option>)}</Select></GridRow>
          <GridRow label={t("out")}><Select defaultValue="cut" id="editor-transition-out" name="editor-transition-out">{transitionOptions.map((option) => <option key={option}>{option}</option>)}</Select></GridRow>
        </Section>
      ) : null}
      <Button className="mx-4 my-3 justify-start" variant="ghost">
        <Trash aria-hidden="true" className="h-4 w-4 text-(--red)" />
        {isBackground ? t("removeBg") : t("deleteItem")}
      </Button>
    </aside>
  );
}

function hasId(item: unknown): item is { id: string } {
  return typeof item === "object" && item !== null && "id" in item && typeof item.id === "string";
}

function isVisualItem(item: unknown): item is { end: number; mediaId: string; sentences: [number, number]; start: number } {
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
    Array.isArray(item.sentences)
  );
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
