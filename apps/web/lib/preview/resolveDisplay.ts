import type { AlignedSentence } from "@/lib/hooks/useAlignment";

// ── Layer shape (mirrors project.json schema) ────────────────────────────────

type Motion = { kind: string; easing: string };
type Transitions = { in: string; out: string };

type BaseItem = {
  id: string;
  mediaId: string;
  sentences: [number, number];
  start: number;
  end: number;
  motion: Motion;
  transitions: Transitions;
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
  fg: Array<{ mediaId: string; compositing: "fullscreen"; opacity: number }>;
  pip: Array<{ mediaId: string; placement: PipPlacement; opacity: number }>;
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
