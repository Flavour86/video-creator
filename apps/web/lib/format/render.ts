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

export function formatHistoryMeta(entry: { bytes: number | null; durationSec: number | null; outputExists: boolean; preset: RenderPreset; status: string }): string {
  if (entry.status !== "done") {
    return `${entry.status} · excluded`;
  }
  if (!entry.outputExists) {
    return `${formatRenderResolution(entry.preset)} · missing output`;
  }
  return [formatRenderResolution(entry.preset), formatDuration(entry.durationSec), formatBytes(entry.bytes)].join(" · ");
}

export function truncateFilename(name: string, max = 18): string {
  if (name.length <= max) return name;
  const keep = Math.max(4, max - 3);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${name.slice(0, head)}...${name.slice(-tail)}`;
}
