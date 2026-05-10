import type { RenderManifest, RenderPreset } from "@/lib/format/render";

export type { RenderPreset } from "@/lib/format/render";

export type RenderPhase = "idle" | "verifying" | "prerender" | "subtitles" | "composing" | "muxing" | "done" | "error" | "cancelled";
export type RenderStageState = "pending" | "active" | "done" | "failed";

export type RenderStageView = {
  detail: string;
  labelKey: "verifyAlignment" | "prerender" | "subtitles" | "compose" | "mux" | "history";
  state: RenderStageState;
  when: string;
};

export type RenderJob = {
  bytes: number | null;
  durationSec: number | null;
  etaSec: number | null;
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
  speed: string | null;
  startedAt: string;
  status: string;
};

export type RenderHistoryEntry = {
  bytes: number | null;
  durationSec: number | null;
  filename: string;
  finishedAt: string | null;
  id: string;
  outputPath: string;
  outputExists: boolean;
  preset: RenderPreset;
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
  stage: "cache_warm" | "compose" | "muxing" | "done" | "error" | "cancelled";
  type: "progress";
};

export type RenderLogEvent = {
  line: string;
  render_id: string;
  type: "log";
};

export type RenderSocketEvent = RenderProgressEvent | RenderLogEvent;
