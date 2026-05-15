import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSetupDraft } from "./useSetupDraft";

function setupDraftSession(overrides: Record<string, unknown> = {}) {
  return {
    setup_id: "setup_abc123",
    draft: {
      project_id: null,
      path: "E:\\video-projects\\tokyo-essay",
      name: "Tokyo Essay",
      output_preset: "final",
      voice: null,
      transcript: null,
      subtitle_generation: {
        status: "ready",
        cue_count: 0,
        total_duration_s: 0,
        cache_state: "unknown",
        error_message: null,
      },
      alignment: {
        status: "pending",
        hash: "",
        device: "cuda fp16",
        model: "large-v3",
        audio_duration: 0,
        cache_hit: false,
      },
      ...overrides,
    },
  };
}

describe("useSetupDraft", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return { ok: true, json: async () => setupDraftSession() } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
  });

  test("creates a setup draft session in setup mode", async () => {
    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.name).toBe("Tokyo Essay"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/setup/drafts",
      expect.objectContaining({ method: "POST" }),
    );
    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
      String(url).endsWith("/setup/drafts"),
    );
    const body = JSON.parse(String(createCall?.[1]?.body));
    expect(body).toEqual({ output_preset: "final" });
    expect(String(createCall?.[1]?.body)).not.toContain("test01");
  });

  test("uploads voice blob through setup artifact endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return { ok: true, json: async () => setupDraftSession() } as Response;
      }
      if (url.endsWith("/setup/drafts/setup_abc123/artifacts/voice")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
            }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.name).toBe("Tokyo Essay"));
    const file = new File(["voice-bytes"], "voice.wav", { type: "audio/wav" });
    await act(async () => {
      await result.current.uploadVoice(file);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/setup/drafts/setup_abc123/artifacts/voice",
      expect.objectContaining({ body: expect.any(FormData), method: "POST" }),
    );
    expect(result.current.draft.voice?.state).toBe("copied");
  });

  test("runs subtitle generation via setup_id in setup mode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
            }),
        } as Response;
      }
      if (url.endsWith("/subtitle") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "succeeded",
            cue_count: 2,
            total_duration_s: 12,
            cache_state: "miss",
            error_message: null,
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.voice?.state).toBe("copied"));
    await act(async () => {
      await result.current.runSubtitle();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/subtitle",
      expect.objectContaining({
        body: JSON.stringify({ setup_id: "setup_abc123" }),
        method: "POST",
      }),
    );
    expect(result.current.draft.subtitle_generation.status).toBe("succeeded");
  });

  test("runs setup alignment via /subtitle/alignment", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
              transcript: {
                path: "transcript.txt",
                sentence_count: 3,
                state: "parsed",
              },
              subtitle_generation: {
                status: "succeeded",
                cue_count: 3,
                total_duration_s: 12,
                cache_state: "miss",
                error_message: null,
              },
            }),
        } as Response;
      }
      if (url.endsWith("/subtitle/alignment") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "succeeded",
            corrections_applied: 2,
            alignment: {
              status: "aligned",
              hash: "abc123",
              device: "cuda fp16",
              model: "large-v3",
              audio_duration: 12,
              cache_hit: false,
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.subtitle_generation.status).toBe("succeeded"));
    await act(async () => {
      await result.current.runAlignment();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/subtitle/alignment",
      expect.objectContaining({
        body: JSON.stringify({ setup_id: "setup_abc123" }),
        method: "POST",
      }),
    );
    expect(result.current.draft.alignment.status).toBe("aligned");
    expect(result.current.alignmentCorrections).toBe(2);
  });

  test("handles failed setup alignment response contract without throwing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
              transcript: {
                path: "transcript.txt",
                sentence_count: 3,
                state: "parsed",
              },
              subtitle_generation: {
                status: "succeeded",
                cue_count: 3,
                total_duration_s: 12,
                cache_state: "miss",
                error_message: null,
              },
            }),
        } as Response;
      }
      if (url.endsWith("/subtitle/alignment") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "failed",
            corrections_applied: 0,
            error_code: "MISMATCHED_TEXT",
            error_message: "Transcript text does not match audio.",
            alignment: {
              status: "failed",
              hash: "abc123",
              device: "cuda fp16",
              model: "large-v3",
              audio_duration: 12,
              cache_hit: false,
              error: "Transcript text does not match audio.",
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.subtitle_generation.status).toBe("succeeded"));
    await act(async () => {
      await result.current.runAlignment();
    });
    expect(result.current.draft.alignment.status).toBe("failed");
    expect(result.current.alignmentCorrections).toBeNull();
  });

  test("surfaces server error message when alignment request is non-2xx", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
              transcript: {
                path: "transcript.txt",
                sentence_count: 3,
                state: "parsed",
              },
              subtitle_generation: {
                status: "succeeded",
                cue_count: 3,
                total_duration_s: 12,
                cache_state: "miss",
                error_message: null,
              },
            }),
        } as Response;
      }
      if (url.endsWith("/subtitle/alignment") && init?.method === "POST") {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: {
              code: "MISMATCHED_TEXT",
              message: "Transcript text does not match audio closely enough.",
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.draft.subtitle_generation.status).toBe("succeeded"));
    await act(async () => {
      await result.current.runAlignment();
    });
    expect(result.current.draft.alignment.status).toBe("failed");
    expect(result.current.draft.alignment.error).toBe("Transcript text does not match audio closely enough.");
  });

  test("keeps project mode subtitle generation on canonical project id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/projects/p_tokyo/inspect")) {
        return {
          ok: true,
          json: async () => ({
            path: "E:\\video-projects\\tokyo-essay",
            name: "Tokyo Essay",
            voice: {
              path: "voice.wav",
              duration: 12,
              sample_rate: 48000,
              channels: 2,
              codec: "pcm_s16le",
              state: "copied",
            },
            transcript: null,
            subtitle_generation: {
              status: "ready",
              cue_count: 0,
              total_duration_s: 0,
              cache_state: "unknown",
              error_message: null,
            },
            alignment: {
              status: "pending",
              hash: "",
              device: "cuda fp16",
              model: "large-v3",
              audio_duration: 0,
              cache_hit: false,
            },
          }),
        } as Response;
      }
      if (url.endsWith("/subtitle") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "succeeded",
            cue_count: 2,
            total_duration_s: 12,
            cache_state: "miss",
            error_message: null,
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay", "p_tokyo"));
    await waitFor(() => expect(result.current.draft.voice?.state).toBe("copied"));
    await act(async () => {
      await result.current.runSubtitle();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/subtitle",
      expect.objectContaining({
        body: JSON.stringify({ project_id: "p_tokyo" }),
        method: "POST",
      }),
    );
  });

  test("creates final project from the active setup session via POST /projects", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
              transcript: {
                path: "transcript.txt",
                sentence_count: 3,
                state: "parsed",
              },
              subtitle_generation: {
                status: "succeeded",
                cue_count: 3,
                total_duration_s: 12,
                cache_state: "miss",
                error_message: null,
              },
              alignment: {
                status: "aligned",
                hash: "abc123",
                device: "cuda fp16",
                model: "large-v3",
                audio_duration: 12,
                cache_hit: false,
              },
            }),
        } as Response;
      }
      if (url.endsWith("/projects") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            project_id: "p_new123",
            path: "E:\\video-projects\\tokyo-essay",
            name: "Tokyo Essay",
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.canContinue).toBe(true));
    let createdProjectId: string | null = null;
    await act(async () => {
      createdProjectId = await result.current.createProject();
    });
    expect(createdProjectId).toBe("p_new123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/projects",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/projects") && init?.method === "POST");
    expect(createCall?.[1]?.body).toBeUndefined();
  });

  test("surfaces create failure and clears the local setup state for refill", async () => {
    let setupDraftCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/setup/drafts")) {
        setupDraftCalls += 1;
        if (setupDraftCalls > 1) {
          return {
            ok: true,
            json: async () =>
              setupDraftSession({
                name: "",
                path: "E:\\video-projects\\untitled-project",
              }),
          } as Response;
        }
        return {
          ok: true,
          json: async () =>
            setupDraftSession({
              voice: {
                path: "voice.wav",
                duration: 12,
                sample_rate: 48000,
                channels: 2,
                codec: "pcm_s16le",
                state: "copied",
              },
              transcript: {
                path: "transcript.txt",
                sentence_count: 3,
                state: "parsed",
              },
              subtitle_generation: {
                status: "succeeded",
                cue_count: 3,
                total_duration_s: 12,
                cache_state: "miss",
                error_message: null,
              },
              alignment: {
                status: "aligned",
                hash: "abc123",
                device: "cuda fp16",
                model: "large-v3",
                audio_duration: 12,
                cache_hit: false,
              },
            }),
        } as Response;
      }
      if (url.endsWith("/projects") && init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: {
              code: "NOT_EMPTY",
              message: "Project directory already exists and is not empty.",
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.canContinue).toBe(true));
    let createdProjectId: string | null = "not-null";
    await act(async () => {
      createdProjectId = await result.current.createProject();
    });
    expect(createdProjectId).toBeNull();
    expect(result.current.creationError).toBe("Project directory already exists and is not empty.");
    expect(result.current.draft.name).toBe("");
    expect(result.current.canContinue).toBe(false);
  });
});
