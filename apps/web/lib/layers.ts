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

export function packRowsByTime<T extends { end: number; start: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return left.end - right.end;
  });
  const rows: T[][] = [];
  const rowEndTimes: number[] = [];
  for (const item of sorted) {
    const rowIndex = rowEndTimes.findIndex((endTime) => endTime <= item.start);
    if (rowIndex === -1) {
      rows.push([item]);
      rowEndTimes.push(item.end);
      continue;
    }
    rows[rowIndex]?.push(item);
    rowEndTimes[rowIndex] = item.end;
  }
  return rows;
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
  mediaId?: string;
  mediaIds?: string[];
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
      items: layer.items.map((item) => (isVisualItem(item) ? mergeVisualPatch(item, patch) : item)),
    } as VisualLayer;
  }) as Layer[];
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
  const next: VisualItem = { ...item };
  if (patch.cache_status !== undefined) next.cache_status = patch.cache_status;
  if (patch.crossfade !== undefined) next.crossfade = patch.crossfade;
  if (patch.end !== undefined) next.end = patch.end;
  if (patch.mediaId !== undefined) next.mediaId = patch.mediaId;
  if (patch.sentences !== undefined) next.sentences = patch.sentences;
  if (patch.start !== undefined) next.start = patch.start;
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
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    end?: unknown;
    id?: unknown;
    mediaId?: unknown;
    mediaIds?: unknown;
    motion?: unknown;
    start?: unknown;
    transitions?: unknown;
  };
  return (
    typeof candidate.id === "string" &&
    hasVisualMediaReference(candidate) &&
    typeof candidate.start === "number" &&
    typeof candidate.end === "number" &&
    typeof candidate.motion === "object" &&
    candidate.motion !== null &&
    typeof candidate.transitions === "object" &&
    candidate.transitions !== null
  );
}

function hasVisualMediaReference(value: { mediaId?: unknown; mediaIds?: unknown }): boolean {
  const hasMediaId = typeof value.mediaId === "string" && value.mediaId.length > 0;
  const hasMediaIds = Array.isArray(value.mediaIds) && value.mediaIds.some((entry) => typeof entry === "string" && entry.length > 0);
  return hasMediaId || hasMediaIds;
}
