"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DetectedInputs,
  SetupAlignmentState,
  SetupDraft,
  SetupOutputPreset,
  SetupSubtitleGenerationResult,
} from "@vc/shared-schemas";
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
  setOutputPreset: (preset: SetupOutputPreset) => void;
  setPath: (path: string) => void;
};

const emptySubtitleGeneration: SetupSubtitleGenerationResult = {
  status: "ready",
  cue_count: 0,
  total_duration_s: 0,
  cache_state: "unknown",
  error_message: null,
};

export function useSetupDraft(initialPath = "", initialProjectId = ""): UseSetupDraftState {
  const [path, setPathState] = useState(initialPath);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [name, setName] = useState(() => nameFromPath(initialPath));
  const [outputPreset, setOutputPreset] = useState<SetupOutputPreset>("final");
  const [detected, setDetected] = useState<DetectedInputs>({
    ...emptyDetectedInputs,
    path: initialPath,
    name: nameFromPath(initialPath),
  });
  const [alignmentStatus, setAlignmentStatus] = useState<SetupAlignmentState>("pending");

  const inspect = useCallback(async () => {
    if (!path) {
      setDetected({ ...emptyDetectedInputs, path: "", name: "" });
      setAlignmentStatus("pending");
      return;
    }
    try {
      const result = projectId
        ? await request<DetectedInputs>(`/projects/${encodeURIComponent(projectId)}/inspect` as `/${string}`, { method: "POST" })
        : await request<DetectedInputs>(`/setup/inspect?path=${encodeURIComponent(path)}` as `/${string}`);
      setDetected(result);
      setName(result.name);
      setAlignmentStatus(result.alignment.status);
    } catch {
      setDetected({ ...emptyDetectedInputs, path, name: name || nameFromPath(path) });
      setAlignmentStatus("pending");
    }
  }, [name, path, projectId]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const draft = useMemo<SetupDraft>(
    () => ({
      project_id: projectId || undefined,
      path: detected.path || path,
      name,
      output_preset: outputPreset,
      voice: detected.voice,
      transcript: detected.transcript,
      subtitle_generation: emptySubtitleGeneration,
      alignment: {
        ...detected.alignment,
        status: alignmentStatus,
      },
    }),
    [alignmentStatus, detected, name, outputPreset, path, projectId],
  );

  const runAlignment = useCallback(async () => {
    if (!detected.voice || !detected.transcript) {
      return;
    }
    setAlignmentStatus("running");
    try {
      if (draft.project_id) {
        await request(`/projects/${encodeURIComponent(draft.project_id)}/alignment` as `/${string}`, { method: "POST" });
      } else {
        await request(`/projects/align?project=${encodeURIComponent(draft.path)}` as `/${string}`, { method: "POST" });
      }
      await inspect();
    } catch {
      setAlignmentStatus("failed");
    }
  }, [detected.transcript, detected.voice, draft.path, draft.project_id, inspect]);

  return {
    canContinue: alignmentStatus === "aligned" && Boolean(projectId),
    draft,
    inspect,
    runAlignment,
    setName,
    setOutputPreset,
    setPath: (nextPath: string) => {
      setPathState(nextPath);
      setProjectId("");
      setName(nameFromPath(nextPath));
    },
  };
}

function nameFromPath(path: string): string {
  if (!path) {
    return "";
  }
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "Untitled Project";
}
