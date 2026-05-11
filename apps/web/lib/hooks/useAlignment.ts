import { useCallback, useEffect, useState } from "react";

export type AlignedSentence = {
  index: number;
  text: string;
  start_s: number;
  end_s: number;
  confidence_avg: number;
};

export type AlignedWord = {
  sentence_index: number;
  text: string;
  start_s: number;
  end_s: number;
  confidence: number;
};

export type AlignmentResult = {
  sentences: AlignedSentence[];
  words: AlignedWord[];
  cache_hit: boolean;
};

export type AlignmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AlignmentResult }
  | { status: "error"; message: string };

type AlignmentTarget =
  | { kind: "none" }
  | { kind: "path"; value: string }
  | { kind: "projectId"; value: string };

export function useAlignment(projectPath: string) {
  return useAlignmentForTarget(projectPath ? { kind: "path", value: projectPath } : { kind: "none" });
}

export function useProjectAlignment(projectId: string) {
  return useAlignmentForTarget(projectId ? { kind: "projectId", value: projectId } : { kind: "none" });
}

function useAlignmentForTarget(target: AlignmentTarget) {
  const [state, setState] = useState<AlignmentState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const targetValue = target.kind === "none" ? "" : target.value;

  useEffect(() => {
    if (target.kind === "none") return;
    void loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, targetValue]);

  async function loadCached() {
    try {
      const r = await fetch(`/api/server${alignmentPath(target)}`);
      if (r.ok) {
        setState({ status: "done", result: normalizeAlignmentResult((await r.json()) as AlignmentResult) });
      }
    } catch {
      // no cached alignment — stay idle
    }
  }

  const runAlignment = useCallback(
    async (force = false) => {
      setState({ status: "loading" });
      try {
        const url = `/api/server${alignmentPath(target, force)}`;
        const r = await fetch(url, { method: "POST" });
        if (!r.ok) {
          const body = (await r.json()) as { error?: { message?: string } };
          setState({ status: "error", message: body.error?.message ?? "Alignment failed." });
          return;
        }
        setState({ status: "done", result: normalizeAlignmentResult((await r.json()) as AlignmentResult) });
      } catch (err) {
        setState({ status: "error", message: String(err) });
      }
    },
    [target],
  );

  const selectSentence = useCallback(
    (index: number, shiftHeld: boolean, ctrlHeld: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (ctrlHeld) {
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        }
        if (shiftHeld && prev.size > 0) {
          const last = Math.max(...prev);
          const lo = Math.min(last, index);
          const hi = Math.max(last, index);
          for (let i = lo; i <= hi; i++) next.add(i);
          return next;
        }
        return new Set([index]);
      });
    },
    [],
  );

  return { state, selected, runAlignment, selectSentence };
}

function alignmentPath(target: AlignmentTarget, force = false): string {
  if (target.kind === "projectId") {
    const suffix = force ? "?force=true" : "";
    return `/projects/${encodeURIComponent(target.value)}/alignment${suffix}`;
  }
  if (target.kind === "path") {
    const query = new URLSearchParams({ project: target.value });
    if (force) query.set("force", "true");
    return `/projects/align?${query.toString()}`;
  }
  return "/projects/align";
}

function normalizeAlignmentResult(result: AlignmentResult): AlignmentResult {
  const sentences = result.sentences
    .map((sentence) => ({ ...sentence, text: cleanSentenceText(sentence.text) }))
    .filter((sentence) => sentence.text.length > 0)
    .map((sentence, index) => ({ ...sentence, index: index + 1 }));

  return {
    ...result,
    sentences,
  };
}

function cleanSentenceText(text: string): string {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^[\s*_`~-]+|[\s*_`~-]+$/g, "")
    .trim();
  return /^[-*_]{3,}$/.test(cleaned) ? "" : cleaned;
}
