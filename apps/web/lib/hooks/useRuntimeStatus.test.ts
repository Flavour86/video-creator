import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRuntimeStatus } from "./useRuntimeStatus";
import type { RuntimeHealthResponse } from "@vc/shared-schemas";

const RUNTIME_STATUS: RuntimeHealthResponse = {
  status: "ok",
  version: "0.1.0",
  active_renders: 1,
  cached_projects: 4,
  sidecar: { status: "ready", address: "http://127.0.0.1:8787", version: "0.1.0" },
  node: { status: "ready", version: "22.4.1" },
  python: { status: "ready", version: "3.11.9" },
  ffmpeg: { status: "ready", version: "6.1.1" },
  cuda: { status: "ready", available: true, version: "12.8", gpu_label: "NVIDIA RTX" },
  whisperx: { status: "ready", model: "large-v3" },
};

describe("useRuntimeStatus", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => RUNTIME_STATUS,
    });
  });

  it("loads runtime status once through the server proxy", async () => {
    const { result } = renderHook(() => useRuntimeStatus());

    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.status).toEqual(RUNTIME_STATUS));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith("/api/server/health");
  });

  it("exposes a manual refresh without polling", async () => {
    const { result } = renderHook(() => useRuntimeStatus());
    await waitFor(() => expect(result.current.status).toEqual(RUNTIME_STATUS));

    await act(async () => {
      await result.current.refresh();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("stores a readable error when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useRuntimeStatus());

    await waitFor(() => expect(result.current.error).toBe("Runtime status unavailable"));
    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
