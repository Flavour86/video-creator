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
