import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { BackgroundScheduleSegment } from "@vc/shared-schemas";
import { backgroundDeclaredMediaIdsForItem, normalizeBackgroundSchedule } from "./backgroundSchedule";

// ── Layer shape (mirrors project.json schema) ────────────────────────────────

type Motion = { kind: string; easing: string };
type Transitions = { in: string; out: string };

type BaseItem = {
  id: string;
  mediaId?: string;
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

type BgItem = BaseItem & { crossfade: number; schedule?: BackgroundScheduleSegment[] };

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

type BackgroundDisplay = {
  mediaId: string;
  motion: Motion;
  motionProgress: number;
  opacity: number;
  sourceTime: number;
};

export type DisplaySpec = {
  bg?: BackgroundDisplay;
  backgrounds: BackgroundDisplay[];
  fg: Array<{ mediaId: string; compositing: "fullscreen"; opacity: number; sourceTime: number; translateX: number }>;
  pip: Array<{ mediaId: string; placement: PipPlacement; opacity: number; sourceTime: number; translateX: number }>;
  watermark?: { mediaId: string; posX: number; posY: number; scale: number; opacity: number };
  subtitle?: { text: string };
};

type ResolveMediaInfo = {
  duration?: number | null;
  filename?: string;
  kind?: string;
  mediaId?: string;
};

type ResolveDisplayOptions = {
  media?: ResolveMediaInfo[];
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
  if ("crossfade" in item && typeof item.crossfade === "number") {
    return Math.max(0, item.crossfade);
  }
  return 0.5;
}

function activeItem<T extends BaseItem>(items: T[], t: number): T | undefined {
  return items.find((it) => it.start <= t && t < it.end);
}

function mediaIdAtTime(item: BaseItem, currentTime: number): string | null {
  const playlist = item.mediaIds?.filter(Boolean) ?? [];
  if (playlist.length === 0) {
    return item.mediaId ?? null;
  }
  if (playlist.length === 1) {
    return playlist[0] ?? null;
  }
  const duration = Math.max(item.end - item.start, 0.001);
  const relative = Math.min(Math.max(currentTime - item.start, 0), duration - Number.EPSILON);
  const index = Math.min(playlist.length - 1, Math.floor((relative / duration) * playlist.length));
  return playlist[index] ?? null;
}

function backgroundMediaAtTime(
  item: BgItem,
  currentTime: number,
  mediaIndex: ReadonlyMap<string, ResolveMediaInfo>,
): BackgroundDisplay[] {
  const scheduled = scheduledBackgroundMediaAtTime(item, currentTime, mediaIndex);
  if (scheduled !== null) return scheduled;

  const playlist = item.mediaIds?.filter(Boolean) ?? [];
  const mediaIds = playlist.length > 0 ? playlist : item.mediaId ? [item.mediaId] : [];
  if (mediaIds.length === 0) return [];
  if (mediaIds.length === 1) {
    const mediaId = mediaIds[0]!;
    const duration = isVideoMedia(mediaId, mediaIndex) ? mediaDuration(mediaId, mediaIndex) : null;
    const end = duration === null ? item.end : Math.min(item.end, item.start + duration);
    return item.start <= currentTime && currentTime < end
      ? [backgroundDisplay(item, mediaId, transitionOpacity({ ...item, end }, currentTime), currentTime - item.start, item.start, end, currentTime)]
      : [];
  }
  const useVideoDurations = mediaIds.some((mediaId) => isVideoMedia(mediaId, mediaIndex) && mediaDuration(mediaId, mediaIndex) !== null);
  const entries = useVideoDurations
    ? videoPlaylistEntries(item, mediaIds, mediaIndex)
    : imagePlaylistEntries(item, mediaIds);
  return entries
    .filter((entry) => entry.start <= currentTime && currentTime < entry.end)
    .map((entry) => backgroundDisplay(item, entry.mediaId, opacityForWindow(entry, currentTime), currentTime - entry.start, entry.start, entry.end, currentTime));
}

function scheduledBackgroundMediaAtTime(
  item: BgItem,
  currentTime: number,
  mediaIndex: ReadonlyMap<string, ResolveMediaInfo>,
): BackgroundDisplay[] | null {
  const schedule = normalizeBackgroundSchedule(item.schedule, backgroundDeclaredMediaIdsForItem(item));
  if (schedule.length === 0) return null;
  return scheduledPlaylistEntries(item, schedule, mediaIndex)
    .filter((entry) => entry.start <= currentTime && currentTime < entry.end)
    .map((entry) => backgroundDisplay(item, entry.mediaId, opacityForWindow(entry, currentTime), currentTime - entry.start, entry.start, entry.end, currentTime));
}

type PlaylistEntry = {
  end: number;
  fade: number;
  mediaId: string;
  start: number;
  transitionIn: "cut" | "fade";
  transitionOut: "cut" | "fade";
};

function imagePlaylistEntries(item: BgItem, mediaIds: string[]): PlaylistEntry[] {
  const start = item.start;
  const end = item.end;
  const duration = Math.max(end - start, 0);
  if (duration <= 0) return [];
  const slot = duration / mediaIds.length;
  const fade = Math.min(bgCrossfade(item), slot / 2);
  return mediaIds.map((mediaId, index) => {
    const slotStart = start + index * slot;
    const slotEnd = index === mediaIds.length - 1 ? end : start + (index + 1) * slot;
    return {
      end: slotEnd,
      fade,
      mediaId,
      start: index > 0 ? Math.max(start, slotStart - fade) : slotStart,
      transitionIn: index > 0 && fade > 0 ? "fade" : "cut",
      transitionOut: index < mediaIds.length - 1 && fade > 0 ? "fade" : "cut",
    };
  });
}

function videoPlaylistEntries(
  item: BgItem,
  mediaIds: string[],
  mediaIndex: ReadonlyMap<string, ResolveMediaInfo>,
): PlaylistEntry[] {
  const start = item.start;
  const end = item.end;
  const fade = bgCrossfade(item);
  const entries: PlaylistEntry[] = [];
  let cursor = start;
  for (let index = 0; index < mediaIds.length; index += 1) {
    const mediaId = mediaIds[index]!;
    const duration = mediaDuration(mediaId, mediaIndex) ?? Math.max(end - cursor, 0);
    const entryStart = Math.max(start, cursor);
    const entryEnd = Math.min(end, entryStart + duration);
    if (entryEnd <= entryStart) break;
    const entryFade = Math.min(fade, (entryEnd - entryStart) / 2);
    entries.push({
      end: entryEnd,
      fade: entryFade,
      mediaId,
      start: entryStart,
      transitionIn: index > 0 && entryFade > 0 ? "fade" : "cut",
      transitionOut: index < mediaIds.length - 1 && entryFade > 0 && entryEnd < end ? "fade" : "cut",
    });
    if (entryEnd >= end) break;
    cursor = index < mediaIds.length - 1 && entryFade > 0 ? entryEnd - entryFade : entryEnd;
  }
  return entries;
}

function scheduledPlaylistEntries(
  item: BgItem,
  schedule: BackgroundScheduleSegment[],
  mediaIndex: ReadonlyMap<string, ResolveMediaInfo>,
): PlaylistEntry[] {
  const parentStart = item.start;
  const parentEnd = item.end;
  const fade = bgCrossfade(item);
  const ranges = schedule
    .map((segment) => {
      const start = Math.max(parentStart, segment.start);
      const duration = mediaDuration(segment.mediaId, mediaIndex);
      const scheduledEnd = Math.min(parentEnd, segment.end);
      const end = isVideoMedia(segment.mediaId, mediaIndex) && duration !== null
        ? Math.min(scheduledEnd, start + duration)
        : scheduledEnd;
      return { end, mediaId: segment.mediaId, start };
    })
    .filter((entry) => entry.end > entry.start);

  return ranges.map((range, index) => {
    const entryFade = Math.min(fade, (range.end - range.start) / 2);
    const previous = ranges[index - 1];
    const next = ranges[index + 1];
    const hasAdjacentPrevious = previous ? Math.abs(previous.end - range.start) < 0.001 : false;
    const hasAdjacentNext = next ? Math.abs(range.end - next.start) < 0.001 : false;
    return {
      end: range.end,
      fade: entryFade,
      mediaId: range.mediaId,
      start: index > 0 && hasAdjacentPrevious && entryFade > 0 ? Math.max(parentStart, range.start - entryFade) : range.start,
      transitionIn: index > 0 && hasAdjacentPrevious && entryFade > 0 ? "fade" : "cut",
      transitionOut: index < ranges.length - 1 && hasAdjacentNext && entryFade > 0 ? "fade" : "cut",
    };
  });
}

function backgroundDisplay(
  item: BgItem,
  mediaId: string,
  opacity: number,
  sourceTime: number,
  start: number,
  end: number,
  currentTime: number,
): BackgroundDisplay {
  return {
    mediaId,
    motion: item.motion,
    motionProgress: easedProgress(item.motion.easing, start, end, currentTime),
    opacity,
    sourceTime,
  };
}

function easedProgress(easing: string, start: number, end: number, currentTime: number): number {
  const duration = Math.max(end - start, 0.001);
  const progress = clamp((currentTime - start) / duration, 0, 1);
  if (easing === "ease_in") return progress * progress;
  if (easing === "ease_out") return 1 - (1 - progress) * (1 - progress);
  if (easing === "ease_in_out") {
    return progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
  }
  return progress;
}

function opacityForWindow(entry: PlaylistEntry, currentTime: number): number {
  if (entry.transitionIn === "fade" && currentTime - entry.start < entry.fade) {
    return clamp((currentTime - entry.start) / entry.fade, 0, 1);
  }
  if (entry.transitionOut === "fade" && entry.end - currentTime < entry.fade) {
    return clamp((entry.end - currentTime) / entry.fade, 0, 1);
  }
  return 1;
}

function mediaIndexById(media: ResolveMediaInfo[] | undefined): Map<string, ResolveMediaInfo> {
  const index = new Map<string, ResolveMediaInfo>();
  for (const item of media ?? []) {
    if (item.mediaId) index.set(item.mediaId, item);
    if (item.filename) index.set(item.filename, item);
  }
  return index;
}

function isVideoMedia(mediaId: string, mediaIndex: ReadonlyMap<string, ResolveMediaInfo>): boolean {
  const kind = mediaIndex.get(mediaId)?.kind ?? "";
  if (kind.includes("video")) return true;
  const extension = mediaId.split(".").at(-1)?.toLowerCase() ?? "";
  return ["avi", "flv", "m4v", "mkv", "mov", "mp4", "rmvb", "webm"].includes(extension);
}

function mediaDuration(mediaId: string, mediaIndex: ReadonlyMap<string, ResolveMediaInfo>): number | null {
  const duration = mediaIndex.get(mediaId)?.duration;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Main resolver (pure function) ────────────────────────────────────────────

export function resolveDisplay(
  layers: Layer[],
  sentences: AlignedSentence[],
  currentTime: number,
  options: ResolveDisplayOptions = {},
): DisplaySpec {
  const spec: DisplaySpec = { backgrounds: [], fg: [], pip: [] };
  const mediaIndex = mediaIndexById(options.media);

  // Project layers are stored top-to-bottom; iterate backwards for bottom-to-top render order.
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = layers[layerIndex];
    if (!layer) {
      continue;
    }
    if (layer.kind === "bg") {
      let item: BgItem | undefined;
      for (let itemIndex = layer.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const candidate = layer.items[itemIndex] as BgItem;
        if (candidate.start <= currentTime && currentTime < candidate.end) {
          item = candidate;
          break;
        }
      }
      if (item) {
        const backgrounds = backgroundMediaAtTime(item, currentTime, mediaIndex);
        if (backgrounds.length > 0) {
          spec.backgrounds = backgrounds;
          spec.bg = backgrounds.at(-1);
        }
      }
    } else if (layer.kind === "fg") {
      const item = activeItem(layer.items, currentTime);
      const mediaId = item ? mediaIdAtTime(item, currentTime) : null;
      if (item && mediaId) {
        spec.fg.push({
          mediaId,
          compositing: "fullscreen",
          opacity: transitionOpacity(item, currentTime),
          sourceTime: currentTime - item.start,
          translateX: transitionTranslateX(item, currentTime),
        });
      }
    } else if (layer.kind === "pip") {
      const item = activeItem(layer.items as PipItem[], currentTime);
      const mediaId = item ? mediaIdAtTime(item, currentTime) : null;
      if (item && mediaId) {
        spec.pip.push({
          mediaId,
          placement: {
            posX: item.pip.posX,
            posY: item.pip.posY,
            size: item.pip.size,
            radius: item.pip.radius,
            opacity: item.pip.opacity,
          },
          opacity: transitionOpacity(item, currentTime),
          sourceTime: currentTime - item.start,
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
