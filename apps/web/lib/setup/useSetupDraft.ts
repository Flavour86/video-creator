"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DetectedInputs,
  SetupDraft,
  SetupOutputPreset,
  SetupSubtitleGenerationResult,
} from "@vc/shared-schemas";
import { request, ServerRequestError } from "@/lib/api/server";

export const defaultSetupPath = "";

type SetupDraftSessionResponse = {
  setup_id: string;
  draft: SetupDraft;
};

type SetupInspectResponse = DetectedInputs & {
  subtitle_generation?: SetupSubtitleGenerationResult;
};

type SetupArtifactKind = "voice" | "transcript" | "watermark";
type SetupAlignmentRunResponse = {
  status: "ready" | "running" | "succeeded" | "failed";
  corrections_applied: number;
  alignment: SetupDraft["alignment"];
  error_code?: string | null;
  error_message?: string | null;
};

export type UseSetupDraftState = {
  alignmentCorrections: number | null;
  canContinue: boolean;
  createProject: () => Promise<string | null>;
  creationError: string | null;
  draft: SetupDraft;
  inspect: () => Promise<void>;
  runAlignment: () => Promise<void>;
  runSubtitle: () => Promise<void>;
  setName: (name: string) => void;
  setOutputPreset: (preset: SetupOutputPreset) => void;
  setPath: (path: string) => void;
  uploadTranscript: (file: File) => Promise<void>;
  uploadVoice: (file: File) => Promise<void>;
  uploadWatermark: (file: File) => Promise<void>;
};

const emptySubtitleGeneration: SetupSubtitleGenerationResult = {
  status: "ready",
  cue_count: 0,
  total_duration_s: 0,
  cache_state: "unknown",
  error_message: null,
};

export function useSetupDraft(initialPath = "", initialProjectId = ""): UseSetupDraftState {
  const [path, setPathState] = useState(initialPath || defaultSetupPath);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [setupId, setSetupId] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const [alignmentCorrections, setAlignmentCorrections] = useState<number | null>(null);
  const [draft, setDraft] = useState<SetupDraft>(() =>
    emptyDraft(initialPath || defaultSetupPath, initialProjectId),
  );
  const creatingDraftRef = useRef(false);
  const projectMode = Boolean(projectId);

  const inspectProject = useCallback(async () => {
    if (!projectId) {
      return;
    }
    try {
      const result = await request<SetupInspectResponse>(
        `/projects/${encodeURIComponent(projectId)}/inspect` as `/${string}`,
        { method: "POST" },
      );
      setDraft((prev) => ({
        ...prev,
        project_id: projectId,
        path: result.path || prev.path,
        name: result.name,
        voice: result.voice,
        transcript: result.transcript,
        subtitle_generation: result.subtitle_generation ?? emptySubtitleGeneration,
        alignment: result.alignment,
      }));
      setAlignmentCorrections(null);
    } catch {
      setDraft((prev) => ({ ...prev, project_id: projectId }));
      setAlignmentCorrections(null);
    }
  }, [projectId]);

  const createDraft = useCallback(async () => {
    if (projectMode || setupId || creatingDraftRef.current) {
      return;
    }
    creatingDraftRef.current = true;
    try {
      const body: {
        name?: string;
        output_preset: SetupOutputPreset;
        path?: string;
      } = {
        output_preset: draft.output_preset,
      };
      if (path) {
        body.path = path;
      }
      if (draft.name.trim()) {
        body.name = draft.name;
      }
      const response = await request<SetupDraftSessionResponse>("/setup/drafts", {
        body,
        method: "POST",
      });
      setSetupId(response.setup_id);
      setDraft(response.draft);
    } finally {
      creatingDraftRef.current = false;
    }
  }, [draft.name, draft.output_preset, path, projectMode, setupId]);

  const inspect = useCallback(async () => {
    if (projectMode) {
      await inspectProject();
      return;
    }
    if (!setupId) {
      return;
    }
    try {
      const response = await request<SetupDraftSessionResponse>(
        `/setup/drafts/${encodeURIComponent(setupId)}` as `/${string}`,
      );
      setDraft(response.draft);
    } catch {
      // Keep current UI state for recoverable polling failures.
    }
  }, [inspectProject, projectMode, setupId]);

  useEffect(() => {
    if (projectMode) {
      void inspectProject();
      return;
    }
    void createDraft();
  }, [createDraft, inspectProject, projectMode]);

  const patchDraft = useCallback(async (payload: Record<string, unknown>) => {
    if (!setupId) {
      return;
    }
    try {
      const response = await request<SetupDraftSessionResponse>(
        `/setup/drafts/${encodeURIComponent(setupId)}` as `/${string}`,
        {
          body: payload,
          method: "PATCH",
        },
      );
      setDraft(response.draft);
    } catch {
      // Keep optimistic local state.
    }
  }, [setupId]);

  const uploadArtifact = useCallback(async (kind: SetupArtifactKind, file: File) => {
    if (!setupId) {
      return;
    }
    const form = new FormData();
    form.append("file", file);
    const response = await request<SetupDraftSessionResponse>(
      `/setup/drafts/${encodeURIComponent(setupId)}/artifacts/${kind}` as `/${string}`,
      {
        body: form,
        method: "POST",
      },
    );
    setDraft(response.draft);
    if (kind !== "watermark") {
      setAlignmentCorrections(null);
    }
    setCreationError(null);
  }, [setupId]);

  const runAlignment = useCallback(async () => {
    const canRunNow = Boolean(
      draft.name.trim()
      && draft.voice?.state === "copied"
      && draft.transcript?.state === "parsed"
      && draft.subtitle_generation.status === "succeeded"
      && draft.alignment.status !== "running",
    );
    if (!canRunNow) {
      return;
    }

    if (projectMode && projectId) {
      try {
        setDraft((prev) => ({
          ...prev,
          alignment: {
            ...prev.alignment,
            status: "running",
          },
        }));
        await request(`/projects/${encodeURIComponent(projectId)}/alignment` as `/${string}`, { method: "POST" });
        await inspectProject();
        setAlignmentCorrections(null);
      } catch (error) {
        const errorMessage = extractServerErrorMessage(error) ?? "Alignment failed.";
        setDraft((prev) => ({
          ...prev,
          alignment: {
            ...prev.alignment,
            status: "failed",
            error: errorMessage,
          },
        }));
        setAlignmentCorrections(null);
      }
      return;
    }
    if (!setupId) {
      return;
    }
    try {
      setDraft((prev) => ({
        ...prev,
        alignment: {
          ...prev.alignment,
          status: "running",
        },
      }));
      const response = await request<SetupAlignmentRunResponse | SetupDraft["alignment"]>("/subtitle/alignment", {
        body: { setup_id: setupId },
        method: "POST",
      });
      const rawAlignment = "alignment" in response ? response.alignment : response;
      const alignment = (
        "status" in response
        && response.status === "ready"
        && "error_message" in response
      )
        ? {
          ...rawAlignment,
          error: response.error_message ?? rawAlignment.error,
        }
        : rawAlignment;
      const corrections = (
        "corrections_applied" in response
        && "status" in response
        && response.status === "succeeded"
      )
        ? response.corrections_applied
        : null;
      setDraft((prev) => ({
        ...prev,
        alignment,
      }));
      setAlignmentCorrections(corrections);
    } catch (error) {
      const errorMessage = extractServerErrorMessage(error) ?? "Alignment failed.";
      setDraft((prev) => ({
        ...prev,
        alignment: {
          ...prev.alignment,
          status: "failed",
          error: errorMessage,
        },
      }));
      setAlignmentCorrections(null);
    }
  }, [draft.alignment.status, draft.name, draft.subtitle_generation.status, draft.voice?.state, draft.transcript?.state, inspectProject, projectId, projectMode, setupId]);

  const runSubtitle = useCallback(async () => {
    if (!draft.name.trim() || draft.voice?.state !== "copied") {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      subtitle_generation: {
        status: "running",
        cue_count: 0,
        total_duration_s: 0,
        cache_state: "unknown",
        error_message: null,
      },
      alignment: {
        ...prev.alignment,
        status: "pending",
      },
    }));
    setAlignmentCorrections(null);
    try {
      const result = await request<SetupSubtitleGenerationResult>("/subtitle", {
        body: projectMode && projectId ? { project_id: projectId } : { setup_id: setupId },
        method: "POST",
      });
      setDraft((prev) => ({
        ...prev,
        subtitle_generation: result,
      }));
    } catch {
      setDraft((prev) => ({
        ...prev,
        subtitle_generation: {
          status: "failed",
          cue_count: 0,
          total_duration_s: 0,
          cache_state: "unknown",
          error_message: "Subtitle generation failed.",
        },
      }));
    }
  }, [draft.name, draft.voice, projectId, projectMode, setupId]);

  const canContinue = Boolean(
    draft.name.trim()
      && (projectId || setupId)
      && draft.voice?.state === "copied"
      && draft.subtitle_generation.status === "succeeded"
      && draft.alignment.status === "aligned",
  );

  const createProject = useCallback(async (): Promise<string | null> => {
    if (!canContinue) {
      return null;
    }
    if (projectId) {
      return projectId;
    }
    if (!setupId) {
      return null;
    }
    try {
      const response = await request<{ project_id: string }>("/projects", {
        method: "POST",
      });
      setCreationError(null);
      return response.project_id;
    } catch (error) {
      const message = extractServerErrorMessage(error) ?? "Project creation failed. Refill Setup to try again.";
      setCreationError(message);
      setSetupId("");
      setPathState(defaultSetupPath);
      setDraft(emptyDraft(defaultSetupPath, ""));
      setAlignmentCorrections(null);
      return null;
    }
  }, [canContinue, projectId, setupId]);

  return {
    alignmentCorrections,
    canContinue,
    createProject,
    creationError,
    draft,
    inspect,
    runAlignment,
    runSubtitle,
    setName: (nextName: string) => {
      setDraft((prev) => ({ ...prev, name: nextName }));
      setCreationError(null);
      if (!projectMode) {
        void patchDraft({ name: nextName });
      }
    },
    setOutputPreset: (preset: SetupOutputPreset) => {
      setDraft((prev) => ({ ...prev, output_preset: preset }));
      setCreationError(null);
      if (!projectMode) {
        void patchDraft({ output_preset: preset });
      }
    },
    setPath: (nextPath: string) => {
      setPathState(nextPath || defaultSetupPath);
      setProjectId("");
      setSetupId("");
      setDraft(emptyDraft(nextPath || defaultSetupPath, ""));
      setAlignmentCorrections(null);
      setCreationError(null);
    },
    uploadTranscript: async (file: File) => {
      await uploadArtifact("transcript", file);
    },
    uploadVoice: async (file: File) => {
      await uploadArtifact("voice", file);
    },
    uploadWatermark: async (file: File) => {
      await uploadArtifact("watermark", file);
    },
  };
}

function emptyDraft(path: string, projectId: string): SetupDraft {
  return {
    project_id: projectId || undefined,
    path,
    name: nameFromPath(path),
    output_preset: "final",
    voice: null,
    transcript: null,
    subtitle_generation: emptySubtitleGeneration,
    alignment: {
      status: "pending",
      hash: "",
      device: "cuda fp16",
      model: "large-v3",
      audio_duration: 0,
      cache_hit: false,
    },
  };
}

function nameFromPath(path: string): string {
  if (!path) {
    return "";
  }
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "Untitled Project";
}

function extractServerErrorMessage(error: unknown): string | null {
  if (!(error instanceof ServerRequestError)) {
    return null;
  }
  const payload = error.payload;
  if (
    payload
    && typeof payload === "object"
    && "error" in payload
    && payload.error
    && typeof payload.error === "object"
    && "message" in payload.error
    && typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return null;
}
