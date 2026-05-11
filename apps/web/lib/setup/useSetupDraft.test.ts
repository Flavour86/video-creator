import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSetupDraft } from "./useSetupDraft";

describe("useSetupDraft", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: "E:\\video-projects\\tokyo-essay",
        name: "Tokyo Essay",
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
      }),
    });
  });

  test("keeps canContinue false until alignment is aligned", async () => {
    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay", "p_tokyo"));
    await waitFor(() => expect(result.current.draft.alignment.status).toBe("pending"));
    expect(result.current.canContinue).toBe(false);
  });

  test("sets canContinue true for aligned inspection results", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        path: "E:\\video-projects\\tokyo-essay",
        name: "Tokyo Essay",
        voice: null,
        transcript: null,
        alignment: {
          status: "aligned",
          hash: "abc",
          device: "cuda · fp16",
          model: "large-v3",
          audio_duration: 942,
          cache_hit: true,
        },
      }),
    });
    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay", "p_tokyo"));
    await waitFor(() => expect(result.current.canContinue).toBe(true));
  });

  test("does not inspect a fallback project when no folder is selected", async () => {
    const { result } = renderHook(() => useSetupDraft());

    await waitFor(() => expect(result.current.draft.path).toBe(""));
    expect(result.current.canContinue).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("uses the selected folder basename while inspection is unavailable", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\existing-video"));

    await waitFor(() => expect(result.current.draft.path).toBe("E:\\video-projects\\existing-video"));
    expect(result.current.draft.name).toBe("existing-video");
  });

  test("runs project-id alignment without forcing a scaffold or cache miss", async () => {
    let aligned = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/projects/p_tokyo/inspect")) {
        return {
          ok: true,
          json: async () => ({
            path: "E:\\video-projects\\tokyo-essay",
            name: "Tokyo Essay",
            voice: { path: "voice.wav", duration: 12, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
            transcript: { path: "transcript.txt", sentence_count: 2, state: "parsed" },
            alignment: {
              status: aligned ? "aligned" : "pending",
              hash: "abc",
              device: "cuda 路 fp16",
              model: "large-v3",
              audio_duration: 12,
              cache_hit: true,
            },
          }),
        } as Response;
      }
      if (url.endsWith("/projects/p_tokyo/alignment")) {
        aligned = true;
        return { ok: true, json: async () => ({ sentences: [], words: [], cache_hit: true }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay", "p_tokyo"));
    await waitFor(() => expect(result.current.draft.voice).not.toBeNull());
    await act(async () => {
      await result.current.runAlignment();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/server/projects/p_tokyo/alignment",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/setup/scaffold"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("force=true"))).toBe(false);
  });
});
