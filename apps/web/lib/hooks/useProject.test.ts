import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SUBTITLES, useProject } from "./useProject";
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
    subtitles: DEFAULT_SUBTITLES,
    watermark: null,
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

  it("defaults subtitles to burn-in off", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.subtitles.burn_in).toBe(false);
  });

  it("has no watermark by default", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.watermark).toBeNull();
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

it("setSubtitles falls back to defaults for null project data", () => {
  const { result } = renderHook(() => useProject());
  act(() => result.current.setSubtitles(null));
  expect(result.current.subtitles).toEqual(DEFAULT_SUBTITLES);
});

it("setWatermark updates watermark", () => {
  const { result } = renderHook(() => useProject());
  const watermark = { mediaId: "logo.png", posX: 100, posY: 100, scale: 0.08, opacity: 60 };
  act(() => result.current.setWatermark(watermark));
  expect(result.current.watermark).toEqual(watermark);
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

describe("saveSubtitles", () => {
  it("does nothing when projectPath is empty", async () => {
    const { result } = renderHook(() => useProject());
    await act(async () => {
      await result.current.saveSubtitles(true);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends PUT to /projects/subtitles with correct body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subtitles: { ...DEFAULT_SUBTITLES, burn_in: true } }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => {
      await result.current.saveSubtitles(true);
    });

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/projects/subtitles");
    expect((opts as RequestInit).method).toBe("PUT");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ burn_in: true });
  });

  it("updates store subtitles on successful save", async () => {
    const subtitles = { ...DEFAULT_SUBTITLES, burn_in: true };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subtitles }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => {
      await result.current.saveSubtitles(true);
    });

    expect(result.current.subtitles).toEqual(subtitles);
  });
});

describe("saveWatermark", () => {
  it("sends PUT to /projects/watermark with correct body", async () => {
    const watermark = { mediaId: "logo.png", posX: 100, posY: 100, scale: 0.08, opacity: 60 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ watermark }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => {
      await result.current.saveWatermark(watermark);
    });

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/projects/watermark");
    expect((opts as RequestInit).method).toBe("PUT");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual(watermark);
    expect(result.current.watermark).toEqual(watermark);
  });

  it("sends null mediaId when clearing watermark", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ watermark: null }),
    });

    const { result } = renderHook(() => useProject());
    act(() => result.current.setProjectPath("/my/proj"));
    await act(async () => {
      await result.current.saveWatermark(null);
    });

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ mediaId: null });
    expect(result.current.watermark).toBeNull();
  });
});
