import type { BackgroundScheduleSegment } from "@vc/shared-schemas";
import type { Layer } from "./resolveDisplay";

type BackgroundScheduleItem = {
  mediaId?: string | null;
  mediaIds?: readonly (string | null | undefined)[] | null;
  schedule?: readonly ScheduleInput[] | null;
};

type ScheduleInput = Partial<Omit<BackgroundScheduleSegment, "end" | "lockedDuration" | "start">> & {
  end?: number | string | null;
  lockedDuration?: boolean | null;
  start?: number | string | null;
};

export function parseBackgroundTime(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const text = value.trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const parts = text.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;
  const numbers = parts.map((part) => Number(part));
  if (parts.length === 2) {
    const [minutes, seconds] = numbers as [number, number];
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  const [hours, minutes, seconds] = numbers as [number, number, number];
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatBackgroundTime(seconds: number): string {
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const remainingSeconds = normalized % 60;
  if (hours > 0) {
    return `${padTimePart(hours)}:${padTimePart(minutes)}:${padTimePart(remainingSeconds)}`;
  }
  return `${padTimePart(minutes)}:${padTimePart(remainingSeconds)}`;
}

export function normalizeBackgroundSchedule(
  schedule: readonly ScheduleInput[] | null | undefined,
  mediaIds: readonly string[] = [],
): BackgroundScheduleSegment[] {
  const allowedIds = normalizeMediaIds(mediaIds);
  const allowedOrder = new Map(allowedIds.map((mediaId, index) => [mediaId, index]));
  return (schedule ?? [])
    .map((segment, index) => normalizeBackgroundScheduleSegment(segment, index))
    .filter((segment): segment is BackgroundScheduleSegment => {
      if (!segment) return false;
      return allowedOrder.size === 0 || allowedOrder.has(segment.mediaId);
    })
    .sort((left, right) => {
      if (allowedOrder.size > 0) {
        const leftOrder = allowedOrder.get(left.mediaId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = allowedOrder.get(right.mediaId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      }
      if (left.start !== right.start) return left.start - right.start;
      return left.end - right.end;
    });
}

export function backgroundDeclaredMediaIdsForItem(item: BackgroundScheduleItem): string[] {
  const playlist = normalizeMediaIds(item.mediaIds ?? []);
  if (playlist.length > 0) return playlist;
  return typeof item.mediaId === "string" ? normalizeMediaIds([item.mediaId]) : [];
}

export function backgroundMediaIdsForItem(item: BackgroundScheduleItem): string[] {
  const ids = backgroundDeclaredMediaIdsForItem(item);
  return normalizeMediaIds([
    ...ids,
    ...(item.schedule ?? []).map((segment) => segment.mediaId),
  ]);
}

export function normalizeBackgroundLayerSchedules(layers: Layer[]): Layer[] {
  return layers.map((layer) => {
    if (layer.kind !== "bg") return layer;
    return {
      ...layer,
      items: layer.items.map((item) => {
        const mediaIds = normalizeMediaIds(item.mediaIds ?? []);
        const allowedIds = mediaIds.length > 0 ? mediaIds : backgroundDeclaredMediaIdsForItem(item);
        const schedule = normalizeBackgroundSchedule(item.schedule, allowedIds);
        const normalizedItem = {
          ...item,
          ...(item.mediaIds ? { mediaIds } : {}),
        };
        if (schedule.length > 0) {
          return { ...normalizedItem, schedule };
        }
        const { schedule: _schedule, ...withoutSchedule } = normalizedItem;
        return withoutSchedule;
      }),
    };
  });
}

function normalizeBackgroundScheduleSegment(segment: ScheduleInput | null | undefined, index: number): BackgroundScheduleSegment | null {
  if (!segment || typeof segment.mediaId !== "string") return null;
  const mediaId = segment.mediaId.trim();
  if (!mediaId) return null;
  const start = coerceScheduleTime(segment.start);
  const end = coerceScheduleTime(segment.end);
  if (start === null || end === null || end <= start) return null;
  return {
    id: typeof segment.id === "string" && segment.id.trim() ? segment.id.trim() : `bg-seg-${mediaId}-${index + 1}`,
    mediaId,
    start,
    end,
    lockedDuration: segment.lockedDuration === true,
  };
}

function coerceScheduleTime(value: number | string | null | undefined): number | null {
  return typeof value === "number" || typeof value === "string" ? parseBackgroundTime(value) : null;
}

function normalizeMediaIds(mediaIds: readonly (string | null | undefined)[]): string[] {
  const ids: string[] = [];
  for (const mediaId of mediaIds) {
    if (typeof mediaId !== "string") continue;
    const normalized = mediaId.trim();
    if (!normalized || ids.includes(normalized)) continue;
    ids.push(normalized);
  }
  return ids;
}

function padTimePart(value: number): string {
  return String(value).padStart(2, "0");
}
