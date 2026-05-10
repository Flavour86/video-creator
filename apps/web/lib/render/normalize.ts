import { formatRenderFilename, manifestForPreset, type RenderPreset } from "@/lib/format/render";
import type { RenderHistoryEntry, RenderJob, RenderPhase, RenderProgressEvent, RenderStageView } from "./types";

export type RenderHistoryResponse = {
  duration_s: number | null;
  file_size: number | null;
  finished_at: string | null;
  id: string;
  message: string | null;
  output_path: string;
  output_exists?: boolean;
  preset: string;
  started_at: string;
  status: string;
};

export function normalizePreset(value: string): RenderPreset {
  return value === "draft" ? "draft" : "final";
}

export function normalizeJob(row: RenderHistoryResponse, progress?: Partial<RenderProgressEvent>): RenderJob {
  const preset = normalizePreset(row.preset);
  const phase = progress ? phaseFromProgress(progress) : phaseFromStatus(row.status);
  const outputPath = progress?.output_path ?? row.output_path;

  return {
    bytes: row.file_size,
    durationSec: row.duration_s,
    etaSec: progress?.eta_seconds ?? null,
    filename: filenameFromPath(outputPath) || formatRenderFilename(preset, row.started_at),
    finishedAt: row.finished_at,
    framesWritten: progress?.current_frame ?? 0,
    id: row.id,
    manifest: manifestForPreset(preset),
    outputPath,
    outputExists: row.output_exists ?? (row.file_size ?? 0) > 0,
    phase,
    preset,
    progress: Math.min(100, Math.max(0, progress?.percent ?? (row.status === "done" ? 100 : 0))),
    speed: progress?.speed ?? null,
    startedAt: row.started_at,
    status: row.status,
  };
}

export function normalizeHistory(row: RenderHistoryResponse): RenderHistoryEntry {
  const preset = normalizePreset(row.preset);
  return {
    bytes: row.file_size,
    durationSec: row.duration_s,
    filename: filenameFromPath(row.output_path) || formatRenderFilename(preset, row.started_at),
    finishedAt: row.finished_at,
    id: row.id,
    outputPath: row.output_path,
    outputExists: row.output_exists ?? (row.file_size ?? 0) > 0,
    preset,
    status: row.status,
  };
}

export function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

export function phaseFromProgress(event: Partial<RenderProgressEvent>): RenderPhase {
  if (event.stage === "cache_warm") return (event.percent ?? 0) <= 1.5 ? "verifying" : "prerender";
  if (event.stage === "compose") return "composing";
  if (event.stage === "muxing") return "muxing";
  if (event.stage === "done") return "done";
  if (event.stage === "cancelled") return "cancelled";
  if (event.stage === "error") return "error";
  return "idle";
}

export function phaseFromStatus(status: string): RenderPhase {
  if (status === "running") return "verifying";
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  if (status === "error") return "error";
  return "idle";
}

export function useRenderStages(job: RenderJob | null): RenderStageView[] {
  const phase = job?.phase ?? "idle";
  const failed = phase === "error";
  const order: Array<RenderStageView["labelKey"]> = ["verifyAlignment", "prerender", "subtitles", "compose", "mux", "history"];
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
  if (phase === "verifying") return 0;
  if (phase === "prerender") return 1;
  if (phase === "subtitles") return 2;
  if (phase === "composing") return 3;
  if (phase === "muxing") return 4;
  if (phase === "done") return 6;
  if (phase === "error") return 3;
  return -1;
}

function detailForStage(labelKey: RenderStageView["labelKey"], job: RenderJob | null): string {
  if (labelKey === "verifyAlignment") return "alignment";
  if (labelKey === "prerender") return ".vc/clips";
  if (labelKey === "subtitles") return ".vc/subtitles.srt";
  if (labelKey === "compose") return job ? `${job.manifest.preset} · CRF ${job.manifest.crf}` : "ffmpeg single pass";
  if (labelKey === "mux") return "renders/";
  return "app.db";
}
