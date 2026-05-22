import { formatRenderFilename, manifestForRender, type RenderPreset } from "@/lib/format/render";
import type {
  RenderArtifact,
  RenderBackendCapabilities,
  RenderEvent,
  RenderHistoryEntry,
  RenderJob,
  RenderPhase,
  RenderProgressEvent,
  RenderResolution,
  RenderStageView,
} from "./types";

export type RenderHistoryResponse = {
  artifacts?: RenderArtifact[];
  completed_at?: string | null;
  created_at?: string | null;
  duration?: number | null;
  duration_s: number | null;
  events?: RenderEvent[];
  file_size: number | null;
  finished_at: string | null;
  id: string;
  message: string | null;
  output_exists?: boolean;
  output_path: string;
  preset: string | null;
  render_id?: string;
  resolution?: string | null;
  started_at?: string | null;
  status: string;
  capabilities?: RenderBackendCapabilities;
};

export function normalizePreset(value: string): RenderPreset {
  return value === "draft" ? "draft" : "final";
}

export function normalizeJob(row: RenderHistoryResponse, progress?: Partial<RenderProgressEvent>): RenderJob {
  const preset = normalizePreset(row.preset ?? "final");
  const stage = progress?.stage;
  const messageStatus = statusFromMessageAndStage(progress?.message, stage);
  const phase = messageStatus ?? (progress ? phaseFromProgress(progress) : phaseFromStatus(row.status));
  const outputPath = progress?.output_path ?? row.output_path;
  const startedAt = row.started_at ?? row.created_at ?? "";
  const finishedAt = row.finished_at ?? row.completed_at ?? null;
  const resolution = normalizeResolution(row.resolution, preset);

  return {
    artifacts: row.artifacts ?? [],
    capabilities: row.capabilities,
    bytes: row.file_size,
    durationSec: row.duration_s ?? row.duration ?? null,
    etaSec: progress?.eta_seconds ?? null,
    events: row.events ?? [],
    filename: filenameFromPath(outputPath) || formatRenderFilename(preset, startedAt),
    finishedAt,
    framesWritten: progress?.current_frame ?? 0,
    id: row.render_id ?? row.id,
    manifest: manifestForRender(preset, resolution),
    outputExists: row.output_exists ?? (row.file_size ?? 0) > 0,
    outputPath,
    phase,
    preset,
    progress: Math.min(100, Math.max(0, progress?.percent ?? (phase === "done" ? 100 : 0))),
    resolution,
    speed: progress?.speed ?? null,
    startedAt,
    status: statusForPhase(phase),
  };
}

export function normalizeHistory(row: RenderHistoryResponse): RenderHistoryEntry {
  const preset = normalizePreset(row.preset ?? "final");
  const resolution = normalizeResolution(row.resolution, preset);
  const phase = phaseFromStatus(row.status);
  return {
    artifacts: row.artifacts ?? [],
    capabilities: row.capabilities,
    bytes: row.file_size,
    durationSec: row.duration_s ?? row.duration ?? null,
    events: row.events ?? [],
    filename: filenameFromPath(row.output_path) || formatRenderFilename(preset, row.started_at ?? row.created_at ?? ""),
    finishedAt: row.finished_at ?? row.completed_at ?? null,
    id: row.render_id ?? row.id,
    outputExists: row.output_exists ?? (row.file_size ?? 0) > 0,
    outputPath: row.output_path,
    preset,
    resolution,
    status: statusForPhase(phase),
  };
}

export function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

export function phaseFromProgress(event: Partial<RenderProgressEvent>): RenderPhase {
  if (event.stage === "queued") return "queued";
  if (event.stage === "verify_alignment_cache") return "verifying";
  if (event.stage === "pre_render_cached_clips") return "prerender";
  if (event.stage === "build_subtitles_srt") return "subtitles";
  if (event.stage === "compose_filtergraph") return "composing";
  if (event.stage === "mux_mp4_faststart") return "muxing";
  if (event.stage === "append_render_history_to_app_db") return "loggingHistory";

  if (event.stage === "cache_warm") {
    const message = (event.message ?? "").toLowerCase();
    if (message.includes("queued")) return "queued";
    if (message.includes("subtitle")) return "subtitles";
    if (message.includes("pre-render")) return "prerender";
    return "verifying";
  }
  if (event.stage === "compose") return "composing";
  if (event.stage === "muxing") return "muxing";
  if (event.stage === "done") return "done";
  if (event.stage === "cancelled") return "cancelled";
  if (event.stage === "failed" || event.stage === "error") return "failed";
  return "idle";
}

export function phaseFromStatus(status: string): RenderPhase {
  const value = status.toLowerCase();
  if (value === "queued") return "queued";
  if (value === "running" || value === "rendering" || value === "verifying") return "verifying";
  if (value === "prerender" || value === "pre_rendering_clips") return "prerender";
  if (value === "subtitles" || value === "building_subtitles") return "subtitles";
  if (value === "composing") return "composing";
  if (value === "muxing") return "muxing";
  if (value === "logging_history") return "loggingHistory";
  if (value === "done" || value === "rendered") return "done";
  if (value === "cancelling") return "cancelling";
  if (value === "cancelled") return "cancelled";
  if (value === "failed" || value === "error") return "failed";
  if (value === "output_missing") return "outputMissing";
  if (value === "partial_excluded" || value === "partial" || value === "partial_output_excluded") return "partialExcluded";
  if (value === "ffmpeg_warning") return "ffmpegWarning";
  if (value === "ffmpeg_fatal_error") return "ffmpegFatalError";
  if (value === "history_empty") return "historyEmpty";
  return "idle";
}

export function useRenderStages(job: RenderJob | null): RenderStageView[] {
  const phase = job?.phase ?? "idle";
  const failed = phase === "failed" || phase === "outputMissing" || phase === "partialExcluded" || phase === "ffmpegFatalError";
  const order: Array<RenderStageView["labelKey"]> = ["queued", "verifyAlignment", "prerender", "subtitles", "compose", "mux", "history"];
  const activeIndex = activeStageIndex(phase);
  return order.map((labelKey, index) => {
    const state = failed && index === activeIndex ? "failed" : index < activeIndex || phase === "done" ? "done" : index === activeIndex ? "active" : "pending";
    return {
      detail: detailForStage(labelKey, job),
      labelKey,
      state,
      when: state === "active" ? "running..." : state === "done" ? `+${Math.max(0.2, index * 0.7).toFixed(1)}s` : state === "failed" ? "failed" : "queued",
    };
  });
}

function activeStageIndex(phase: RenderPhase): number {
  if (phase === "queued") return 0;
  if (phase === "verifying") return 1;
  if (phase === "prerender") return 2;
  if (phase === "subtitles") return 3;
  if (phase === "composing") return 4;
  if (phase === "muxing") return 5;
  if (phase === "loggingHistory" || phase === "done") return 6;
  if (phase === "failed" || phase === "outputMissing" || phase === "partialExcluded" || phase === "ffmpegWarning" || phase === "ffmpegFatalError") return 4;
  return -1;
}

function detailForStage(labelKey: RenderStageView["labelKey"], job: RenderJob | null): string {
  if (labelKey === "queued") return "queue";
  if (labelKey === "verifyAlignment") return "alignment";
  if (labelKey === "prerender") return ".vc/clips";
  if (labelKey === "subtitles") return ".vc/subtitles.srt";
  if (labelKey === "compose") return job ? `${job.manifest.preset} · CRF ${job.manifest.crf}` : "ffmpeg single pass";
  if (labelKey === "mux") return "renders/";
  return "app.db";
}

function normalizeResolution(value: string | null | undefined, preset: RenderPreset): RenderResolution {
  if (value === "1920x1080" || value === "1280x720" || value === "1080x1920") return value;
  if (value === "1080p") return "1920x1080";
  if (value === "720p") return "1280x720";
  if (value === "9:16") return "1080x1920";
  return preset === "draft" ? "1280x720" : "1920x1080";
}

function statusForPhase(phase: RenderPhase): string {
  const mapping: Record<RenderPhase, string> = {
    idle: "idle",
    queued: "queued",
    verifying: "verifying",
    prerender: "prerender",
    subtitles: "subtitles",
    composing: "composing",
    muxing: "muxing",
    loggingHistory: "logging_history",
    done: "done",
    cancelling: "cancelling",
    cancelled: "cancelled",
    failed: "failed",
    outputMissing: "output_missing",
    partialExcluded: "partial_excluded",
    ffmpegWarning: "ffmpeg_warning",
    ffmpegFatalError: "ffmpeg_fatal_error",
    historyEmpty: "history_empty",
  };
  return mapping[phase];
}

export function statusFromMessageAndStage(
  message: string | null | undefined,
  stage: string | undefined,
): RenderPhase | null {
  const text = (message ?? "").toLowerCase();
  if (text.includes("ffmpeg fatal") || text.includes("fatal error")) return "ffmpegFatalError";
  if (text.includes("ffmpeg warning")) return "ffmpegWarning";
  if (stage === "failed" || stage === "error") return "failed";
  return null;
}
