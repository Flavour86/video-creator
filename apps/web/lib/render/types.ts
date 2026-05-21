import type { RenderManifest, RenderPreset } from "@/lib/format/render";

export type { RenderPreset } from "@/lib/format/render";

export type RenderResolution = "1920x1080" | "1280x720" | "1080x1920";
export type RenderPhase =
  | "idle"
  | "queued"
  | "verifying"
  | "prerender"
  | "subtitles"
  | "composing"
  | "muxing"
  | "loggingHistory"
  | "done"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "outputMissing"
  | "partialExcluded"
  | "ffmpegWarning"
  | "ffmpegFatalError"
  | "historyEmpty";
export type RenderContractState =
  | "idle"
  | "queued"
  | "verifying"
  | "prerender"
  | "subtitles"
  | "composing"
  | "muxing"
  | "logging_history"
  | "done"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "output_missing"
  | "partial_excluded"
  | "ffmpeg_warning"
  | "ffmpeg_fatal_error"
  | "history_empty";
export type RenderStageState = "pending" | "active" | "done" | "failed";

export type RenderStageView = {
  detail: string;
  labelKey: "queued" | "verifyAlignment" | "prerender" | "subtitles" | "compose" | "mux" | "history";
  state: RenderStageState;
  when: string;
};

export type RenderArtifact = {
  artifact_id?: string;
  kind: string;
  path: string;
  size?: number | null;
};

export type RenderEvent = {
  detail_json?: string | null;
  event_id?: string;
  kind?: "progress" | "log";
  message?: string | null;
  percent?: number | null;
  render_id?: string;
  stage?: RenderProgressEvent["stage"];
  state?: RenderContractState | null;
};

export type RenderJob = {
  artifacts: RenderArtifact[];
  capabilities?: RenderBackendCapabilities;
  bytes: number | null;
  durationSec: number | null;
  etaSec: number | null;
  events: RenderEvent[];
  filename: string;
  finishedAt: string | null;
  framesWritten: number;
  id: string;
  manifest: RenderManifest;
  outputPath: string;
  outputExists: boolean;
  phase: RenderPhase;
  preset: RenderPreset;
  progress: number;
  resolution: RenderResolution;
  speed: string | null;
  startedAt: string;
  status: string;
};

export type RenderHistoryEntry = {
  artifacts: RenderArtifact[];
  capabilities?: RenderBackendCapabilities;
  bytes: number | null;
  durationSec: number | null;
  events: RenderEvent[];
  filename: string;
  finishedAt: string | null;
  id: string;
  outputPath: string;
  outputExists: boolean;
  preset: RenderPreset;
  resolution: RenderResolution;
  status: string;
};

export type RenderProgressEvent = {
  current_frame?: number;
  eta_seconds?: number;
  message?: string;
  output_path?: string;
  percent: number;
  render_id: string;
  speed?: string;
  stage:
    | "queued"
    | "verify_alignment_cache"
    | "pre_render_cached_clips"
    | "build_subtitles_srt"
    | "compose_filtergraph"
    | "mux_mp4_faststart"
    | "append_render_history_to_app_db"
    | "done"
    | "failed"
    | "cancelled"
    | "cache_warm"
    | "compose"
    | "muxing"
    | "error";
  type: "progress";
};

export type RenderLogEvent = {
  line: string;
  render_id: string;
  type: "log";
};

export type RenderSocketEvent = RenderProgressEvent | RenderLogEvent;

export type RenderBackendCapabilities = {
  reveal_in_explorer_supported: boolean;
};
