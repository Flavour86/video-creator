"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DetectedInputs, SetupAlignmentState, SetupDraft } from "@vc/shared-schemas";
import { request } from "@/lib/api/server";

export const defaultSetupPath = "E:\\claude\\video-creator\\projects\\test01";

const emptyDetectedInputs: DetectedInputs = {
  path: defaultSetupPath,
  name: "test01",
  voice: null,
  transcript: null,
  alignment: {
    status: "pending",
    hash: "",
    device: "cuda · fp16",
    model: "large-v3",
    audio_duration: 0,
    cache_hit: false,
  },
};

export type UseSetupDraftState = {
  canContinue: boolean;
  draft: SetupDraft;
  inspect: () => Promise<void>;
  runAlignment: () => Promise<void>;
  setName: (name: string) => void;
  setOutputPreset: (preset: string) => void;
  setPath: (path: string) => void;
};

export function useSetupDraft(initialPath = defaultSetupPath): UseSetupDraftState {
  const [path, setPathState] = useState(initialPath);
  const [name, setName] = useState(() => nameFromPath(initialPath));
  const [outputPreset, setOutputPreset] = useState("final");
  const [detected, setDetected] = useState<DetectedInputs>({
    ...emptyDetectedInputs,
    path: initialPath,
    name: nameFromPath(initialPath),
  });
  const [alignmentStatus, setAlignmentStatus] = useState<SetupAlignmentState>("pending");

  const inspect = useCallback(async () => {
    try {
      const result = await request<DetectedInputs>(`/setup/inspect?path=${encodeURIComponent(path)}` as `/${string}`);
      setDetected(result);
      setName(result.name);
      setAlignmentStatus(result.alignment.status);
    } catch {
      setDetected({ ...emptyDetectedInputs, path, name: name || nameFromPath(path) });
      setAlignmentStatus("pending");
    }
  }, [name, path]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const draft = useMemo<SetupDraft>(
    () => ({
      path: detected.path || path,
      name,
      output_preset: outputPreset,
      voice: detected.voice,
      transcript: detected.transcript,
      alignment: {
        ...detected.alignment,
        status: alignmentStatus,
      },
    }),
    [alignmentStatus, detected, name, outputPreset, path],
  );

  const runAlignment = useCallback(async () => {
    if (!detected.voice || !detected.transcript) {
      return;
    }
    setAlignmentStatus("running");
    try {
      await request("/setup/scaffold", {
        method: "POST",
        body: { path: draft.path, name: draft.name, output_preset: draft.output_preset, force: true },
      });
      await request(`/projects/align?project=${encodeURIComponent(draft.path)}` as `/${string}`, { method: "POST" });
      await inspect();
    } catch {
      setAlignmentStatus("failed");
    }
  }, [detected.transcript, detected.voice, draft.name, draft.output_preset, draft.path, inspect]);

  return {
    canContinue: alignmentStatus === "aligned",
    draft,
    inspect,
    runAlignment,
    setName,
    setOutputPreset,
    setPath: (nextPath: string) => {
      setPathState(nextPath);
      setName(nameFromPath(nextPath));
    },
  };
}

function nameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "Untitled Project";
}
