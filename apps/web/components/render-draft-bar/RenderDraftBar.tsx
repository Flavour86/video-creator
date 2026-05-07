import { ExternalLink, X } from "lucide-react";
import Link from "next/link";

import type { RenderProgressState } from "@/lib/hooks/useRenderProgress";

type Props = {
  projectPath: string;
  state: RenderProgressState;
  onCancel: () => void;
};

export function RenderDraftBar({ projectPath, state, onCancel }: Props) {
  if (state.status === "idle") return null;

  const percent =
    state.status === "running" || state.status === "done" || state.status === "error"
      ? Math.round(state.percent)
      : 0;
  const isDone = state.status === "done";
  const isError = state.status === "error";
  const label = renderLabel(state);

  return (
    <div
      className={`relative flex h-7 shrink-0 items-center justify-between overflow-hidden border-b px-4 text-xs ${
        isDone
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : isError
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-neutral-200 bg-white text-neutral-900"
      }`}
    >
      {!isDone && !isError && (
        <div
          className="absolute inset-y-0 left-0 bg-neutral-900/10 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      )}
      <div className="relative z-10 flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        <span className="truncate font-medium">{label}</span>
        <span className="opacity-60">{percent}%</span>
      </div>
      <div className="relative z-10 flex items-center gap-2">
        {isDone && (
          <Link
            className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-0.5 font-medium hover:bg-emerald-100"
            href={`/render?project=${encodeURIComponent(projectPath)}&renderId=${encodeURIComponent(state.renderId)}`}
          >
            <ExternalLink size={13} />
            Open
          </Link>
        )}
        {state.status === "running" && (
          <button
            className="inline-flex items-center gap-1 rounded border border-neutral-300 px-2 py-0.5 font-medium hover:bg-neutral-50"
            onClick={onCancel}
            type="button"
          >
            <X size={13} />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function renderLabel(state: RenderProgressState): string {
  if (state.status === "starting") return "starting render";
  if (state.status === "done") return state.message ?? "Draft ready";
  if (state.status === "error") return state.message;
  if (state.status !== "running") return "";
  if (state.stage === "cache_warm") return state.message ?? "verifying cache";
  if (state.stage === "compose") return state.message ?? "ffmpeg compose";
  return state.message ?? "muxing audio";
}
