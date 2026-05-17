import type { AlignedSentence } from "@/lib/hooks/useAlignment";

// ── Layer shape (mirrors project.json schema) ────────────────────────────────

type Motion = { kind: string; easing: string };
type Transitions = { in: string; out: string };

type BaseItem = {
  id: string;
  mediaId: string;
  mediaIds?: string[];
  anchor?: "sentences" | "time";
  from?: string;
  to?: string;
  sentences: [number, number];
  start: number;
  end: number;
  motion: Motion;
  transitions: Transitions;
  cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
  orphaned?: boolean;
  orphan_reason?: string | null;
};

type BgItem = BaseItem & { crossfade: number };

type PipItem = BaseItem & {
  pip: PipPlacement;
};

export type Layer =
  | { id: string; kind: "sub"; name: string; items: unknown[] }
  | { id: string; kind: "bg"; name: string; items: BgItem[] }
  | { id: string; kind: "fg"; name: string; items: BaseItem[] }
  | { id: string; kind: "pip"; name: string; items: PipItem[] };

// ── Display spec returned to the renderer ────────────────────────────────────

export type PipPlacement = {
  posX: number;
  posY: number;
  size: number;
  radius: number;
  opacity: number;
};

export type DisplaySpec = {
  bg?: { mediaId: string; opacity: number };
  fg: Array<{ mediaId: string; compositing: "fullscreen"; opacity: number; translateX: number }>;
  pip: Array<{ mediaId: string; placement: PipPlacement; opacity: number; translateX: number }>;
  watermark?: { mediaId: string; posX: number; posY: number; scale: number; opacity: number };
  subtitle?: { text: string };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function transitionOpacity(item: BaseItem, t: number): number {
  const fadeDuration = bgCrossfade(item);
  if (item.transitions.in === "fade" && t - item.start < fadeDuration) {
    return (t - item.start) / fadeDuration;
  }
  if (item.transitions.out === "fade" && item.end - t < fadeDuration) {
    return (item.end - t) / fadeDuration;
  }
  return 1;
}

function transitionTranslateX(item: BaseItem, t: number): number {
  const duration = bgCrossfade(item);
  const elapsed = t - item.start;
  const remaining = item.end - t;

  if (item.transitions.in === "slide_left" && elapsed < duration) {
    return (1 - elapsed / duration) * 100;
  }
  if (item.transitions.in === "slide_right" && elapsed < duration) {
    return -(1 - elapsed / duration) * 100;
  }
  if (item.transitions.out === "slide_left" && remaining < duration) {
    return -(1 - remaining / duration) * 100;
  }
  if (item.transitions.out === "slide_right" && remaining < duration) {
    return (1 - remaining / duration) * 100;
  }
  return 0;
}

function bgCrossfade(item: BaseItem): number {
  if ("crossfade" in item && typeof item.crossfade === "number" && item.crossfade > 0) {
    return item.crossfade;
  }
  return 0.5;
}

function activeItem<T extends BaseItem>(items: T[], t: number): T | undefined {
  return items.find((it) => it.start <= t && t < it.end);
}

// ── Main resolver (pure function) ────────────────────────────────────────────

export function resolveDisplay(
  layers: Layer[],
  sentences: AlignedSentence[],
  currentTime: number,
): DisplaySpec {
  const spec: DisplaySpec = { fg: [], pip: [] };

  for (const layer of layers) {
    if (layer.kind === "bg") {
      const item = [...layer.items].reverse().find((candidate) => {
        return candidate.start <= currentTime && currentTime < candidate.end;
      }) as BgItem | undefined;
      if (item) {
        spec.bg = { mediaId: item.mediaId, opacity: transitionOpacity(item, currentTime) };
      }
    } else if (layer.kind === "fg") {
      const item = activeItem(layer.items, currentTime);
      if (item) {
        spec.fg.push({
          mediaId: item.mediaId,
          compositing: "fullscreen",
          opacity: transitionOpacity(item, currentTime),
          translateX: transitionTranslateX(item, currentTime),
        });
      }
    } else if (layer.kind === "pip") {
      const item = activeItem(layer.items as PipItem[], currentTime);
      if (item) {
        spec.pip.push({
          mediaId: item.mediaId,
          placement: {
            posX: item.pip.posX,
            posY: item.pip.posY,
            size: item.pip.size,
            radius: item.pip.radius,
            opacity: item.pip.opacity,
          },
          opacity: transitionOpacity(item, currentTime),
          translateX: transitionTranslateX(item, currentTime),
        });
      }
    }
  }

  const activeSentence = sentences.find(
    (s) => s.start_s <= currentTime && currentTime < s.end_s,
  );
  if (activeSentence) {
    spec.subtitle = { text: activeSentence.text };
  }

  return spec;
}
