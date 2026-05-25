import { describe, expect, test } from "vitest";
import {
  normalizeHistory,
  normalizeJob,
  phaseFromProgress,
  phaseFromStatus,
  statusFromMessageAndStage,
  useRenderStages,
} from "./normalize";
import type { RenderJob } from "./types";

describe("render normalize contract", () => {
  test("maps legacy and spec statuses into render page states", () => {
    expect(phaseFromStatus("running")).toBe("verifying");
    expect(phaseFromStatus("queued")).toBe("queued");
    expect(phaseFromStatus("failed")).toBe("failed");
    expect(phaseFromStatus("error")).toBe("failed");
    expect(phaseFromStatus("output_missing")).toBe("outputMissing");
    expect(phaseFromStatus("partial")).toBe("partialExcluded");
    expect(phaseFromStatus("cancelled")).toBe("cancelled");
  });

  test("maps progress stages to spec stage-aligned phases", () => {
    expect(phaseFromProgress({ stage: "verify_alignment_cache" })).toBe("verifying");
    expect(phaseFromProgress({ stage: "pre_render_cached_clips" })).toBe("prerender");
    expect(phaseFromProgress({ stage: "build_subtitles_srt" })).toBe("subtitles");
    expect(phaseFromProgress({ stage: "compose_filtergraph" })).toBe("composing");
    expect(phaseFromProgress({ stage: "mux_mp4_faststart" })).toBe("muxing");
    expect(phaseFromProgress({ stage: "append_render_history_to_app_db" })).toBe("loggingHistory");
  });

  test("infers warning and fatal states from stage message", () => {
    expect(statusFromMessageAndStage("ffmpeg warning: clipped samples", "compose_filtergraph")).toBe("ffmpegWarning");
    expect(statusFromMessageAndStage("ffmpeg fatal error: invalid argument", "compose_filtergraph")).toBe("ffmpegFatalError");
  });

  test("renders queued and logging-history stages in the stage list", () => {
    const baseJob: RenderJob = {
      artifacts: [],
      bytes: null,
      durationSec: null,
      etaSec: null,
      events: [],
      filename: "out.mp4",
      finishedAt: null,
      framesWritten: 0,
      id: "r-1",
      manifest: {
        audioBitrate: 192000,
        audioCodec: "aac",
        colorMatrix: "bt.709",
        codec: "H.264",
        crf: 18,
        estimatedBytes: 100,
        fps: 30,
        height: 1080,
        pixfmt: "yuv420p",
        preset: "x264 slow",
        width: 1920,
      },
      outputExists: false,
      outputPath: "E:/project/renders/out.mp4",
      phase: "queued",
      preset: "final",
      progress: 0,
      resolution: "1920x1080",
      speed: null,
      startedAt: "2026-05-08T12:00:00Z",
      status: "queued",
    };

    const queued = useRenderStages(baseJob);
    expect(queued[0].labelKey).toBe("queued");
    expect(queued[0].state).toBe("active");

    const logging = useRenderStages({ ...baseJob, phase: "loggingHistory" });
    expect(logging[6].labelKey).toBe("history");
    expect(logging[6].state).toBe("active");
  });

  test("uses normalized done phase for fallback progress when status is rendered", () => {
    const job = normalizeJob({
      duration_s: null,
      file_size: 12,
      finished_at: "2026-05-08T12:01:00Z",
      id: "r-rendered",
      message: null,
      output_path: "E:/project/renders/final.mp4",
      preset: "final",
      status: "rendered",
    });

    expect(job.phase).toBe("done");
    expect(job.progress).toBe(100);
  });

  test("keeps final frame_count when completed row has no live progress event", () => {
    const job = normalizeJob({
      duration_s: null,
      file_size: 12,
      finished_at: "2026-05-08T12:01:00Z",
      frame_count: 9009,
      id: "r-rendered",
      message: null,
      output_path: "E:/project/renders/final.mp4",
      preset: "final",
      status: "rendered",
    });

    expect(job.phase).toBe("done");
    expect(job.framesWritten).toBe(9009);
  });

  test("falls back to max event current_frame when frame_count is unavailable", () => {
    const job = normalizeJob({
      duration_s: null,
      events: [
        { detail_json: "{\"current_frame\":1311}" },
        { detail_json: "{\"current_frame\":9009}" },
        { detail_json: "{\"current_frame\":null}" },
      ],
      file_size: 12,
      finished_at: "2026-05-08T12:01:00Z",
      id: "r-rendered",
      message: null,
      output_path: "E:/project/renders/final.mp4",
      preset: "final",
      status: "rendered",
    });

    expect(job.phase).toBe("done");
    expect(job.framesWritten).toBe(9009);
  });

  test("preserves snake_case render event states from backend contract", () => {
    const entry = normalizeHistory({
      duration_s: null,
      events: [{ stage: "append_render_history_to_app_db", state: "logging_history" }],
      file_size: 12,
      finished_at: "2026-05-08T12:01:00Z",
      id: "r-state",
      message: null,
      output_path: "E:/project/renders/final.mp4",
      preset: "final",
      status: "rendered",
    });

    expect(entry.events[0]?.state).toBe("logging_history");
  });
});
