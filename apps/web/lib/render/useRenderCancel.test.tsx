import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { request } from "@/lib/api/server";
import { useRenderCancel } from "./useRenderCancel";

vi.mock("@/lib/api/server", () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

it("sends the project-scoped cancel request", async () => {
  const { result } = renderHook(() => useRenderCancel("p_test"));

  await expect(result.current("r-1")).resolves.toBe(true);

  expect(requestMock).toHaveBeenCalledWith("/projects/p_test/render/r-1", { method: "DELETE" });
});

it("coalesces duplicate cancel requests while one is pending", async () => {
  let resolveRequest: (value: unknown) => void = () => undefined;
  requestMock.mockReturnValue(new Promise((resolve) => {
    resolveRequest = resolve;
  }));
  const { result } = renderHook(() => useRenderCancel("p_test"));

  const first = result.current("r-1");
  const second = result.current("r-1");
  resolveRequest({});

  await expect(first).resolves.toBe(true);
  await expect(second).resolves.toBe(false);
  expect(requestMock).toHaveBeenCalledTimes(1);
});

it("rejects when project id is missing", async () => {
  const { result } = renderHook(() => useRenderCancel(""));

  await expect(result.current("r-1")).rejects.toThrow("Project id is required.");
  expect(requestMock).not.toHaveBeenCalled();
});
