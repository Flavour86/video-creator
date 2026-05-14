import { useEffect } from "react";
import { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";
import type { RenderJob } from "./types";

export function useRenderHotkeys({
  job,
  onBack,
  onCancel,
  onPlay,
  onReveal,
}: {
  job: RenderJob | null;
  onBack: () => void;
  onCancel: () => void;
  onPlay: () => void;
  onReveal: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTextEditingTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") return;
      if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        onBack();
      }
      if (mod && event.key === "." && job && running(job.phase)) {
        event.preventDefault();
        onCancel();
      }
      if (mod && event.key.toLowerCase() === "o" && job?.phase === "done") {
        event.preventDefault();
        onReveal();
      }
      if (mod && event.key === "Enter" && job?.phase === "done") {
        event.preventDefault();
        onPlay();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [job, onBack, onCancel, onPlay, onReveal]);
}

function running(phase: string): boolean {
  return ["verifying", "prerender", "subtitles", "composing", "muxing"].includes(phase);
}
