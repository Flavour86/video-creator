import { formatDuration } from "@/lib/format";

export type RenderPreset = "draft" | "final";

export type RenderManifest = {
  audioBitrate: number;
  audioCodec: string;
  colorMatrix: string;
  codec: string;
  crf: number;
  estimatedBytes: number;
  fps: number;
  height: number;
  pixfmt: string;
  preset: string;
  width: number;
};

const renderManifests: Record<RenderPreset, RenderManifest> = {
  draft: {
    audioBitrate: 128000,
    audioCodec: "aac",
    colorMatrix: "bt.709",
    codec: "H.264",
    crf: 28,
    estimatedBytes: 36 * 1024 * 1024,
    fps: 30,
    height: 720,
    pixfmt: "yuv420p",
    preset: "x264 ultrafast",
    width: 1280,
  },
  final: {
    audioBitrate: 192000,
    audioCodec: "aac",
    colorMatrix: "bt.709",
    codec: "H.264",
    crf: 18,
    estimatedBytes: 118 * 1024 * 1024,
    fps: 30,
    height: 1080,
    pixfmt: "yuv420p",
    preset: "x264 slow",
    width: 1920,
  },
};

export function manifestForPreset(preset: RenderPreset): RenderManifest {
  return renderManifests[preset];
}

export function manifestForRender(preset: RenderPreset, resolution?: string | null): RenderManifest {
  const manifest = { ...renderManifests[preset] };
  if (resolution === "1280x720") {
    return { ...manifest, width: 1280, height: 720 };
  }
  if (resolution === "1080x1920") {
    return { ...manifest, width: 1080, height: 1920 };
  }
  if (resolution === "1920x1080") {
    return { ...manifest, width: 1920, height: 1080 };
  }
  return manifest;
}

export function formatPercent(value: number | null | undefined): string {
  const safeValue = Math.min(100, Math.max(0, value ?? 0));
  return `${safeValue.toFixed(1)}%`;
}

export function formatRenderSpeed(value: string | number | null | undefined): string {
  if (value == null || value === "") return "--";
  if (typeof value === "string") return value;
  return `${value.toFixed(1)}x`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "--";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value ?? 0)));
}

export function formatBytes(bytes: number | null | undefined, options: { approx?: boolean } = {}): string {
  const value = Math.max(0, bytes ?? 0);
  const prefix = options.approx ? "~" : "";
  if (value < 1024) return `${prefix}${value} B`;
  if (value < 1024 * 1024) return `${prefix}${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${prefix}${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${prefix}${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatBitrate(bps: number): string {
  return `${Math.round(bps / 1000)}kbps`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width}x${height}`;
}

export function formatFps(fps: number): string {
  return `${fps} fps`;
}

export function formatVideoChain(codec: string, crf: number, preset: string): string {
  return `${codec.toLowerCase()} · crf ${crf} · ${preset.replace(/^x264\s+/, "")}`;
}

export function formatAudioChain(codec: string, bitrate: number, sampleRate = 48000): string {
  return `${codec} · ${Math.round(bitrate / 1000)}k · ${Math.round(sampleRate / 1000)}kHz`;
}

export function formatColor(matrix: string, pixfmt: string): string {
  return `${matrix} · ${pixfmt}`;
}

export function formatRenderResolution(preset: RenderPreset): string {
  return preset === "final" ? "1080p" : "720p";
}

export function formatRenderResolutionValue(resolution: string | null | undefined, preset?: RenderPreset): string {
  if (resolution === "1920x1080") return "1080p";
  if (resolution === "1280x720") return "720p";
  if (resolution === "1080x1920") return "9:16";
  return preset ? formatRenderResolution(preset) : "1080p";
}

export function formatRenderFilename(preset: RenderPreset, startedAt: string | Date): string {
  const date = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  if (Number.isNaN(date.getTime())) return `${preset}.mp4`;
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `${preset}-${stamp}-${time}.mp4`;
}

export function formatRenderSpecs(manifest: RenderManifest): string {
  return [
    formatDimensions(manifest.width, manifest.height),
    manifest.codec,
    `CRF ${manifest.crf}`,
    manifest.preset,
    `AAC ${formatBitrate(manifest.audioBitrate)}`,
    manifest.colorMatrix.toUpperCase(),
  ].join(" · ");
}

export function formatHistoryMeta(entry: {
  bytes: number | null;
  durationSec: number | null;
  outputExists: boolean;
  preset: RenderPreset;
  resolution?: string | null;
  status: string;
}): string {
  const resolution = formatRenderResolutionValue(entry.resolution, entry.preset);
  const status = formatHistoryStatus(entry.status, entry.outputExists);
  if (entry.status === "done" && entry.outputExists) {
    return [resolution, formatDuration(entry.durationSec), status, formatBytes(entry.bytes)].join(" · ");
  }
  if (entry.status === "done" && !entry.outputExists) {
    return [resolution, status].join(" · ");
  }
  return [resolution, status, "excluded"].join(" · ");
}

export function formatHistoryStatus(status: string, outputExists: boolean): string {
  const normalized = status.toLowerCase();
  if (normalized === "done" && !outputExists) return "missing output";
  if (normalized === "output_missing") return "missing output";
  if (normalized === "partial" || normalized === "partial_excluded" || normalized === "partial_output_excluded") return "partial output excluded";
  if (normalized === "ffmpeg_warning") return "ffmpeg warning";
  if (normalized === "ffmpeg_fatal_error") return "ffmpeg fatal error";
  return normalized.replaceAll("_", " ");
}

export function truncateFilename(name: string, max = 18): string {
  if (name.length <= max) return name;
  const keep = Math.max(4, max - 3);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${name.slice(0, head)}...${name.slice(-tail)}`;
}
