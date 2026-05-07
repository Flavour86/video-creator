"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FolderOpen,
  Loader2,
  Play,
  X,
} from "lucide-react";

import type { RenderProgressState } from "@/lib/hooks/useRenderProgress";

type RenderStepId = "verify" | "clips" | "subtitles" | "compose" | "mux";
type StepStatus = "pending" | "active" | "done" | "error";

type Props = {
  projectPath: string;
  state: RenderProgressState;
  onCancel: () => void;
};

const STEPS: Array<{ id: RenderStepId; label: string; detail: string }> = [
  { id: "verify", label: "Verifying Cache", detail: "Checking reusable clip renders" },
  { id: "clips", label: "Pre-rendering Clips", detail: "Preparing visual sources" },
  { id: "subtitles", label: "Building Subtitles", detail: "Writing subtitles.srt when enabled" },
  { id: "compose", label: "FFmpeg Compose", detail: "Compositing video layers" },
  { id: "mux", label: "Muxing Audio", detail: "Finalizing video and audio streams" },
];

export function RenderPipeline({ projectPath, state, onCancel }: Props) {
  const percent = progressPercent(state);
  const eta = state.status === "running" ? formatEta(state.etaSeconds) : "";
  const renderId =
    state.status === "running" || state.status === "done" || state.status === "error"
      ? state.renderId
      : undefined;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Final Render</h1>
          <p className="mt-1 max-w-3xl truncate font-mono text-xs text-neutral-500" title={projectPath}>
            {projectPath || "No project selected"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.status === "running" && (
            <button
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50"
              onClick={onCancel}
              type="button"
            >
              <X size={14} />
              Cancel
            </button>
          )}
          {state.status === "done" && renderId && (
            <>
              <button
                className="inline-flex items-center gap-1.5 rounded bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                onClick={() => void renderAction("play", projectPath, renderId)}
                type="button"
              >
                <Play size={14} />
                Play
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50"
                onClick={() => void renderAction("reveal", projectPath, renderId)}
                type="button"
              >
                <FolderOpen size={14} />
                Open Folder
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{statusLabel(state)}</p>
            <p className="text-xs text-neutral-500">{statusDetail(state)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">{percent}%</p>
            {eta && <p className="text-xs text-neutral-500">{eta}</p>}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-neutral-950 transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        {STEPS.map((step) => {
          const stepStatus = statusForStep(step.id, state);
          return (
            <div
              className="grid grid-cols-[24px_1fr_auto] items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2"
              key={step.id}
            >
              <StepIcon status={stepStatus} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="truncate text-xs text-neutral-500">{step.detail}</p>
              </div>
              <span className="text-xs font-medium uppercase text-neutral-400">
                {stepStatus}
              </span>
            </div>
          );
        })}
      </div>

      {state.status === "error" && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
    </section>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 className="text-emerald-600" size={18} />;
  if (status === "active") return <Loader2 className="animate-spin text-neutral-900" size={18} />;
  if (status === "error") return <AlertTriangle className="text-red-600" size={18} />;
  return <Circle className="text-neutral-300" size={18} />;
}

function progressPercent(state: RenderProgressState): number {
  if (state.status === "running" || state.status === "done" || state.status === "error") {
    return Math.round(state.percent);
  }
  return state.status === "starting" ? 0 : 0;
}

function statusLabel(state: RenderProgressState): string {
  if (state.status === "idle") return "Waiting";
  if (state.status === "starting") return "Starting final render";
  if (state.status === "done") return state.message ?? "Render ready";
  if (state.status === "error") return "Render failed";
  return state.message ?? stageLabel(state.stage);
}

function statusDetail(state: RenderProgressState): string {
  if (state.status === "idle") return "Final render starts when a project is supplied.";
  if (state.status === "starting") return "Creating the render job.";
  if (state.status === "done") return state.outputPath;
  if (state.status === "error") return state.outputPath ?? "";
  return [state.speed, state.currentFrame ? `frame ${state.currentFrame}` : ""]
    .filter(Boolean)
    .join(" / ");
}

function statusForStep(step: RenderStepId, state: RenderProgressState): StepStatus {
  if (state.status === "done") return "done";
  if (state.status === "error") return step === "compose" ? "error" : "pending";
  if (state.status === "idle") return "pending";
  if (state.status === "starting") return step === "verify" ? "active" : "pending";
  if (state.stage === "cache_warm") {
    if (step === "verify") return state.percent <= 1.5 ? "active" : "done";
    if (step === "clips") return state.percent > 1.5 ? "active" : "pending";
    return "pending";
  }
  if (state.stage === "compose") {
    if (step === "verify" || step === "clips" || step === "subtitles") return "done";
    return step === "compose" ? "active" : "pending";
  }
  if (state.stage === "muxing") {
    return step === "mux" ? "active" : "done";
  }
  return "pending";
}

function stageLabel(stage: "cache_warm" | "compose" | "muxing"): string {
  if (stage === "cache_warm") return "pre-rendering clips";
  if (stage === "compose") return "ffmpeg compose";
  return "muxing audio";
}

function formatEta(value: number | undefined): string {
  if (value == null) return "";
  if (value < 60) return `${value}s remaining`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s remaining`;
}

async function renderAction(action: "play" | "reveal", projectPath: string, renderId: string) {
  await fetch(
    `/api/server/projects/renders/${encodeURIComponent(renderId)}/${action}?project=${encodeURIComponent(projectPath)}`,
    { method: "POST" },
  );
}
