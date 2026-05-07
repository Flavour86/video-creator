import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { usePlaybackTime } from "./usePlaybackTime";

let rafCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("returns 0 when getTime is null", () => {
  const { result } = renderHook(() => usePlaybackTime(null));
  expect(result.current).toBe(0);
});

it("does not schedule RAF when getTime is null", () => {
  renderHook(() => usePlaybackTime(null));
  expect(rafCallbacks).toHaveLength(0);
});

it("schedules a RAF when getTime is provided", () => {
  renderHook(() => usePlaybackTime(() => 0));
  expect(rafCallbacks.length).toBeGreaterThan(0);
});

it("returns value from getTime after RAF tick", () => {
  const getTime = vi.fn().mockReturnValue(3.14);
  const { result } = renderHook(() => usePlaybackTime(getTime));

  act(() => {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb(0));
  });

  expect(result.current).toBe(3.14);
});

it("stops RAF loop when getTime becomes null", () => {
  const getTime = vi.fn().mockReturnValue(1.0);
  const { rerender } = renderHook(
    ({ fn }: { fn: (() => number) | null }) => usePlaybackTime(fn),
    { initialProps: { fn: getTime } },
  );

  rerender({ fn: null });
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
