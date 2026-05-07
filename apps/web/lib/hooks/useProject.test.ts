import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProject } from "./useProject";
import type { Layer } from "@/lib/preview/resolveDisplay";

const BG_LAYER: Layer = {
  id: "bg-1",
  kind: "bg",
  name: "Background",
  items: [{ mediaId: "bg.jpg", start: 0, end: 10, motion: "none", crossfade: 0, sentences: [1, 3] }],
};

beforeEach(() => {
  useProject.setState({
    projectPath: "",
    layers: [],
    sentences: [],
    duration: 0,
  });
  global.fetch = vi.fn();
});

// ── initial state ─────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("has empty projectPath", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.projectPath).toBe("");
  });

  it("has empty layers array", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.layers).toEqual([]);
  });

  it("has empty sentences array", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.sentences).toEqual([]);
  });

  it("has zero duration", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.duration).toBe(0);
  });
});

// ── setters ───────────────────────────────────────────────────────────────────

it("setProjectPath updates projectPath", () => {
  const { result } = renderHook(() => useProject());
  act(() => result.current.setProjectPath("/my/project"));
  expect(result.current.projectPath).toBe("/my/project");
});

it("setLayers updates layers", () => {
  const { result } = renderHook(() => useProject());
  act(() => result.current.setLayers([BG_LAYER]));
  expect(result.current.layers).toHaveLength(1);
  expect(result.current.layers[0].kind).toBe("bg");
});

it("setSentences updates sentences", () => {
  const { result } = renderHook(() => useProject());
  const s = { index: 1, text: "Hi.", start_s: 0, end_s: 1, confidence_avg: 0.9 };
  act(() => result.current.setSentences([s]));
  expect(result.current.sentences).toEqual([s]);
});

it("setDuration updates duration", () => {
  const { result } = renderHook(() => useProject());
  act(() => result.current.setDuration(42.5));
  expect(result.current.duration).toBe(42.5);
});

// ── saveLayers ────────────────────────────────────────────────────────────────

describe("saveLayers", () => {
  it("does nothing when projectPath is empty", async () => {
    const { result } = renderHook(() => useProject());
    await act(async () => { await result.current.saveLayers([BG_LAYER]); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends PUT to /projects/layers with correct body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ layers: [BG_LAYER] }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => { await result.current.saveLayers([BG_LAYER]); });

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/projects/layers");
    expect(url).toContain(encodeURIComponent("/my/proj"));
    expect((opts as RequestInit).method).toBe("PUT");
    const body = JSON.parse((opts as RequestInit).body as string) as { layers: Layer[] };
    expect(body.layers).toHaveLength(1);
  });

  it("updates store layers on successful save", async () => {
    const saved: Layer[] = [BG_LAYER];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ layers: saved }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => { await result.current.saveLayers(saved); });

    expect(result.current.layers).toEqual(saved);
  });

  it("leaves store unchanged when PUT fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    act(() => result.current.setLayers([BG_LAYER]));
    await act(async () => { await result.current.saveLayers([]); });

    expect(result.current.layers).toEqual([BG_LAYER]);
  });
});
