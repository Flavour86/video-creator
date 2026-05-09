export function formatDuration(seconds: number | null | undefined): string {
  const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function formatRelativeTime(value: string): string {
  if (value === "Yesterday" || value === "Last week" || value.endsWith("ago")) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60 * 60) {
    const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));
    return `${minutes} minutes ago`;
  }
  if (elapsedSeconds < 60 * 60 * 24) {
    const hours = Math.max(1, Math.floor(elapsedSeconds / (60 * 60)));
    return `${hours} hours ago`;
  }
  if (elapsedSeconds < 60 * 60 * 48) {
    return "Yesterday";
  }
  const days = Math.floor(elapsedSeconds / (60 * 60 * 24));
  return days < 7 ? `${days} days ago` : "Last week";
}

export function truncateHash(hex: string, length = 8): string {
  if (!hex) {
    return "";
  }
  return `${hex.slice(0, length)}...`;
}

export function formatTimecode(seconds: number, options: { ms?: boolean } = {}): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const base = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${wholeSeconds.toString().padStart(2, "0")}`;

  if (!options.ms) {
    return base;
  }

  const ms = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${base}.${ms.toString().padStart(3, "0")}`;
}

export function formatRangeLabel(from: number, to: number): string {
  return from === to ? `s${from}` : `s${from}-s${to}`;
}

export function formatImageMeta(width: number, height: number, bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${width}x${height} · ${mb.toFixed(1)} MB`;
}
