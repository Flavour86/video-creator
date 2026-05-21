import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { request } from "@/lib/api/server";
import { useRenderJob } from "./useRenderJob";

vi.mock("@/lib/api/server", () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

function historyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "r-row",
    render_id: "r-row",
    output_path: "E:/project/renders/r-row.mp4",
    preset: "final",
    started_at: "2026-05-21T10:00:00Z",
    finished_at: "2026-05-21T10:01:00Z",
    duration_s: 60,
    status: "done",
    message: null,
    file_size: 1234,
    ...overrides,
  };
}

beforeEach(() => {
  requestMock.mockReset();
});

it("loads a job from project history with limit=500 and render_id match", async () => {
  requestMock.mockResolvedValue([
    historyRow({ id: "db-r1", render_id: "r-1" }),
    historyRow({ id: "db-r2", render_id: "r-target" }),
  ]);

  const { result } = renderHook(() => useRenderJob("p_test", null));
  await act(async () => {
    await result.current.loadJob("r-target");
  });

  expect(requestMock).toHaveBeenCalledWith("/projects/p_test/history?limit=500");
  expect(result.current.job?.id).toBe("r-target");
});
