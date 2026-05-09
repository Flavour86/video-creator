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

export function useAlignment(projectPath: string) {
  const [state, setState] = useState<AlignmentState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!projectPath) return;
    void loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  async function loadCached() {
    try {
      const r = await fetch(
        `/api/server/projects/align?project=${encodeURIComponent(projectPath)}`,
      );
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
        const url =
          `/api/server/projects/align?project=${encodeURIComponent(projectPath)}` +
          (force ? "&force=true" : "");
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
    [projectPath],
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
