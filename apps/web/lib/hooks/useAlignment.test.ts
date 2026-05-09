import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAlignment } from "./useAlignment";

const MOCK_RESULT = {
  sentences: [
    { index: 1, text: "Hello.", start_s: 0, end_s: 1, confidence_avg: 0.9 },
    { index: 2, text: "World.", start_s: 1, end_s: 2, confidence_avg: 0.8 },
  ],
  words: [],
  cache_hit: false,
};

beforeEach(() => {
  // Default: cached alignment not found
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
});

// ── selectSentence ────────────────────────────────────────────────────────────

describe("selectSentence", () => {
  it("single click selects that index", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(3, false, false));
    expect(result.current.selected).toEqual(new Set([3]));
  });

  it("subsequent single click replaces selection", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(3, false, false));
    act(() => result.current.selectSentence(5, false, false));
    expect(result.current.selected).toEqual(new Set([5]));
  });

  it("ctrl-click adds unselected index to set", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(3, false, false));
    act(() => result.current.selectSentence(5, false, true));
    expect(result.current.selected).toEqual(new Set([3, 5]));
  });

  it("ctrl-click removes already-selected index", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(3, false, false));
    act(() => result.current.selectSentence(5, false, true));
    act(() => result.current.selectSentence(5, false, true));
    expect(result.current.selected).toEqual(new Set([3]));
  });

  it("shift-click fills contiguous range lo..hi", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(2, false, false));
    act(() => result.current.selectSentence(5, true, false));
    expect(result.current.selected).toEqual(new Set([2, 3, 4, 5]));
  });

  it("shift-click with empty selection falls back to single-select", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(5, true, false));
    expect(result.current.selected).toEqual(new Set([5]));
  });

  it("shift-click range works when clicked index is below existing max", () => {
    const { result } = renderHook(() => useAlignment(""));
    act(() => result.current.selectSentence(5, false, false));
    act(() => result.current.selectSentence(2, true, false));
    expect(result.current.selected).toEqual(new Set([2, 3, 4, 5]));
  });
});

// ── initial state ─────────────────────────────────────────────────────────────

it("starts idle with empty selection", () => {
  const { result } = renderHook(() => useAlignment(""));
  expect(result.current.state.status).toBe("idle");
  expect(result.current.selected.size).toBe(0);
});

// ── runAlignment ──────────────────────────────────────────────────────────────

describe("runAlignment", () => {
  it("sets status to loading then done on success", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })                                       // loadCached GET → 404
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT });       // POST → 200

    const { result } = renderHook(() => useAlignment("some/project"));
    await act(async () => { await result.current.runAlignment(); });

    expect(result.current.state.status).toBe("done");
  });

  it("exposes sentences after successful alignment", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT });

    const { result } = renderHook(() => useAlignment("some/project"));
    await act(async () => { await result.current.runAlignment(); });

    if (result.current.state.status === "done") {
      expect(result.current.state.result.sentences).toHaveLength(2);
    }
  });

  it("sets status to error when fetch returns non-ok", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Low confidence." } }),
      });

    const { result } = renderHook(() => useAlignment("some/project"));
    await act(async () => { await result.current.runAlignment(); });

    expect(result.current.state.status).toBe("error");
  });

  it("passes force=true when re-running", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_RESULT });

    const { result } = renderHook(() => useAlignment("p/q"));
    await act(async () => { await result.current.runAlignment(true); });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const postUrl = calls.find(([url, opts]: [string, RequestInit]) => opts?.method === "POST")?.[0] as string;
    expect(postUrl).toContain("force=true");
  });
});

// ── loadCached on mount ───────────────────────────────────────────────────────

it("loads cached alignment on mount when projectPath is non-empty", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => MOCK_RESULT });

  const { result } = renderHook(() => useAlignment("some/project"));
  await waitFor(() => expect(result.current.state.status).toBe("done"));
});

it("strips cached transcript markdown noise before exposing sentences", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ...MOCK_RESULT,
      sentences: [
        { index: 1, text: "Hello.", start_s: 0, end_s: 1, confidence_avg: 0.9 },
        { index: 2, text: "---", start_s: 1, end_s: 2, confidence_avg: 0.9 },
        { index: 3, text: "**World.**", start_s: 2, end_s: 3, confidence_avg: 0.9 },
      ],
    }),
  });

  const { result } = renderHook(() => useAlignment("some/project"));
  await waitFor(() => expect(result.current.state.status).toBe("done"));

  if (result.current.state.status === "done") {
    expect(result.current.state.result.sentences.map((sentence) => sentence.text)).toEqual(["Hello.", "World."]);
    expect(result.current.state.result.sentences.map((sentence) => sentence.index)).toEqual([1, 2]);
  }
});
