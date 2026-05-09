"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DetectedInputs, SetupAlignmentState, SetupDraft } from "@vc/shared-schemas";
import { request } from "@/lib/api/server";

export const defaultSetupPath = "E:\\video-projects\\tokyo-essay";

const fallbackDetectedInputs: DetectedInputs = {
  path: defaultSetupPath,
  name: "Tokyo Essay",
  voice: {
    path: `${defaultSetupPath}\\voice.wav`,
    duration: 942,
    sample_rate: 48000,
    channels: 2,
    codec: "pcm_s16le",
    state: "copied",
  },
  transcript: {
    path: `${defaultSetupPath}\\transcript.txt`,
    sentence_count: 164,
    state: "parsed",
  },
  alignment: {
    status: "pending",
    hash: "8a3f2c1df91c44c9a66ff2d83bd91a0d",
    device: "cuda · fp16",
    model: "large-v3",
    audio_duration: 942,
    cache_hit: false,
  },
};

function isEmptyDefaultInspection(result: DetectedInputs): boolean {
  return result.path === defaultSetupPath && !result.voice && !result.transcript && !result.alignment.hash;
}

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
  const [path, setPath] = useState(initialPath);
  const [name, setName] = useState("Tokyo Essay");
  const [outputPreset, setOutputPreset] = useState("final");
  const [detected, setDetected] = useState<DetectedInputs>(fallbackDetectedInputs);
  const [alignmentStatus, setAlignmentStatus] = useState<SetupAlignmentState>(fallbackDetectedInputs.alignment.status);

  const inspect = useCallback(async () => {
    try {
      const result = await request<DetectedInputs>(`/setup/inspect?path=${encodeURIComponent(path)}` as `/${string}`);
      const nextDetected = isEmptyDefaultInspection(result) ? fallbackDetectedInputs : result;
      setDetected(nextDetected);
      setName(nextDetected.name);
      setAlignmentStatus(nextDetected.alignment.status);
    } catch {
      setDetected({ ...fallbackDetectedInputs, path });
      setAlignmentStatus(fallbackDetectedInputs.alignment.status);
    }
  }, [path]);

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
      await request(`/projects/align?project=${encodeURIComponent(draft.path)}` as `/${string}`, {
        method: "POST",
      });
      setAlignmentStatus("aligned");
      await inspect();
    } catch {
      setAlignmentStatus("failed");
    }
  }, [detected.transcript, detected.voice, draft.path, inspect]);

  return {
    canContinue: alignmentStatus === "aligned",
    draft,
    inspect,
    runAlignment,
    setName,
    setOutputPreset,
    setPath,
  };
}
