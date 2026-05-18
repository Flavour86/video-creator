import type { Layer } from "./preview/resolveDisplay";

export type SentencedItem = { id: string; sentences: [number, number] };

export function hasSentenceOverlap(
  items: SentencedItem[],
  from: number,
  to: number,
  excludeId?: string,
): boolean {
  return items
    .filter((it) => it.id !== excludeId)
    .some((it) => it.sentences[0] <= to && it.sentences[1] >= from);
}

export function nextZIndex(layers: Layer[], kind: "fg" | "pip"): number {
  return layers.filter((l) => l.kind === kind).length + 1;
}

export type FgItemParams = {
  id: string;
  mediaId: string;
  from: number;
  to: number;
  startTime: number;
  endTime: number;
  anchor?: "sentences" | "time";
  fromTime?: string;
  toTime?: string;
  motion: string;
  easing: string;
  transIn: string;
  transOut: string;
};

export function buildFgItem(p: FgItemParams) {
  const item = {
    id: p.id,
    mediaId: p.mediaId,
    sentences: [p.from, p.to] as [number, number],
    start: p.startTime,
    end: p.endTime,
    motion: { kind: p.motion, easing: p.easing },
    transitions: { in: p.transIn, out: p.transOut },
  };
  if (p.anchor !== "time") return item;
  return {
    ...item,
    anchor: "time" as const,
    from: p.fromTime,
    to: p.toTime,
  };
}

export type VisualItemPatch = {
  cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
  crossfade?: number;
  end?: number;
  mediaId?: string;
  motion?: Partial<{ easing: string; kind: string }>;
  pip?: Partial<{ opacity: number; posX: number; posY: number; radius: number; size: number }>;
  sentences?: [number, number];
  start?: number;
  transitions?: Partial<{ in: string; out: string }>;
};

type VisualLayer = Extract<Layer, { kind: "bg" | "fg" | "pip" }>;
type VisualItem = {
  id: string;
  cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
  crossfade?: number;
  end: number;
  mediaId: string;
  motion: { easing: string; kind: string };
  pip?: { opacity: number; posX: number; posY: number; radius: number; size: number };
  sentences: [number, number];
  start: number;
  transitions: { in: string; out: string };
};

type PersistedMotionKind =
  | "none"
  | "static"
  | "ken_burns"
  | "ken_burns_strong"
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right";

const PERSISTED_MOTION_KINDS: ReadonlySet<PersistedMotionKind> = new Set([
  "none",
  "static",
  "ken_burns",
  "ken_burns_strong",
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
]);

export function patchVisualItem(
  layers: Layer[],
  layerId: string,
  itemId: string,
  patch: VisualItemPatch,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id !== layerId || layer.kind === "sub") return layer;
    return {
      ...layer,
      items: layer.items.map((candidate) => {
        if (!isVisualItem(candidate) || candidate.id !== itemId) return candidate;
        return mergeVisualPatch(candidate, patch);
      }),
    } as VisualLayer;
  });
}

export function patchBackgroundItems(
  layers: Layer[],
  layerId: string,
  patch: Pick<VisualItemPatch, "crossfade" | "motion">,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id !== layerId || layer.kind !== "bg") return layer;
    return {
      ...layer,
      items: layer.items.map((item) => mergeVisualPatch(item as VisualItem, patch)),
    };
  });
}

export function deleteVisualItem(layers: Layer[], layerId: string, itemId: string): Layer[] {
  return layers.flatMap((layer) => {
    if (layer.id !== layerId || layer.kind === "sub") return [layer];
    const items = layer.items.filter((candidate) => !isVisualItem(candidate) || candidate.id !== itemId);
    if ((layer.kind === "fg" || layer.kind === "pip") && items.length === 0) return [];
    return [{ ...layer, items } as VisualLayer];
  });
}

function mergeVisualPatch(item: VisualItem, patch: VisualItemPatch): VisualItem {
  const next: VisualItem = { ...item, ...patch };
  const currentMotionKind = normalizeMotionKind(item.motion.kind, "none");
  const mergedMotion = patch.motion ? { ...item.motion, ...patch.motion } : item.motion;
  next.motion = {
    ...mergedMotion,
    kind: normalizeMotionKind(mergedMotion.kind, currentMotionKind),
  };
  if (patch.transitions) next.transitions = { ...item.transitions, ...patch.transitions };
  if (item.pip || patch.pip) {
    const base = item.pip ?? { opacity: 100, posX: 50, posY: 50, radius: 0, size: 30 };
    next.pip = { ...base, ...(patch.pip ?? {}) };
  }
  next.cache_status = "invalid";
  return next;
}

function normalizeMotionKind(kind: string, fallback: string): PersistedMotionKind {
  const normalized = kind === "ken_burns_subtle" ? "ken_burns" : kind;
  if (isPersistedMotionKind(normalized)) return normalized;
  const fallbackNormalized = fallback === "ken_burns_subtle" ? "ken_burns" : fallback;
  if (isPersistedMotionKind(fallbackNormalized)) return fallbackNormalized;
  return "none";
}

function isPersistedMotionKind(value: string): value is PersistedMotionKind {
  return PERSISTED_MOTION_KINDS.has(value as PersistedMotionKind);
}

function isVisualItem(value: unknown): value is VisualItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "mediaId" in value &&
    typeof value.mediaId === "string" &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}
