import type { RenderJob } from "@/lib/render/types";
import { useFlash } from "@/lib/render/useFlash";

export function BigBar({ job }: { job: RenderJob | null }) {
  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));
  const doneFlash = useFlash(job?.phase === "done" ? job.id : "", 700);
  const fillClass = fillClassForPhase(job?.phase);

  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progress}
      className="h-[12px] w-full overflow-hidden rounded-full border border-(--line) bg-(--bg-3)"
      role="progressbar"
    >
      <span
        className={`block h-full rounded-full transition-[width] duration-[400ms] ease-out ${fillClass} ${doneFlash ? "animate-pulse" : ""}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function fillClassForPhase(phase: RenderJob["phase"] | undefined): string {
  if (phase === "done") return "bg-(--green)";
  if (phase === "failed" || phase === "ffmpegFatalError") return "bg-(--red)";
  if (phase === "ffmpegWarning") return "bg-(--amber)";
  if (phase === "cancelled") return "bg-(--bg-4)";
  return "bg-gradient-to-r from-[var(--amber)] to-[var(--amber-light)]";
}
