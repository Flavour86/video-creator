import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { request } from "@/lib/api/server";
import { useRenderHistory } from "./useRenderHistory";

vi.mock("@/lib/api/server", () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue([]);
});

it("refreshes from project history with explicit limit=50", async () => {
  renderHook(() => useRenderHistory("p_test"));
  await waitFor(() => {
    expect(requestMock).toHaveBeenCalledWith("/projects/p_test/history?limit=50");
  });
});
