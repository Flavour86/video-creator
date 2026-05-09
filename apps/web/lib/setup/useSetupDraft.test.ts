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
    const { result } = renderHook(() => useSetupDraft());
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
    const { result } = renderHook(() => useSetupDraft());
    await waitFor(() => expect(result.current.canContinue).toBe(true));
  });
});
