import { renderHook, waitFor } from "@testing-library/react";
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
    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay"));
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
    const { result } = renderHook(() => useSetupDraft("E:\\video-projects\\tokyo-essay"));
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
});
