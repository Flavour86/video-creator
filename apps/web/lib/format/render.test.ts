import { describe, expect, test } from "vitest";
import {
  formatBytes,
  formatEta,
  formatHistoryMeta,
  formatPercent,
  formatRenderFilename,
  formatRenderResolution,
  formatRenderResolutionValue,
  formatRenderSpecs,
  manifestForRender,
  manifestForPreset,
  truncateFilename,
} from "./render";

describe("render format helpers", () => {
  test("formats progress, eta, and byte values", () => {
    expect(formatPercent(45.321)).toBe("45.3%");
    expect(formatPercent(120)).toBe("100.0%");
    expect(formatEta(602)).toBe("10:02");
    expect(formatBytes(118 * 1024 * 1024, { approx: true })).toBe("~118 MB");
  });

  test("formats render filenames, resolution, and specs by preset", () => {
    expect(formatRenderResolution("final")).toBe("1080p");
    expect(formatRenderResolution("draft")).toBe("720p");
    expect(formatRenderResolutionValue("1080x1920", "final")).toBe("9:16");
    expect(formatRenderFilename("final", "2026-05-06T15:30:00Z")).toBe("final-2026-05-06-1530.mp4");
    expect(formatRenderSpecs(manifestForPreset("final"))).toContain("1920x1080");
    expect(formatRenderSpecs(manifestForPreset("draft"))).toContain("CRF 28");
    expect(manifestForRender("final", "1080x1920")).toMatchObject({ width: 1080, height: 1920 });
  });

  test("formats history and truncates long filenames", () => {
    expect(formatHistoryMeta({ bytes: 187 * 1024 * 1024, durationSec: 1182, outputExists: true, preset: "final", status: "done" })).toBe("1080p · 19:42 · 187 MB");
    expect(formatHistoryMeta({ bytes: 0, durationSec: null, outputExists: false, preset: "draft", status: "done" })).toBe("720p · missing output");
    expect(formatHistoryMeta({ bytes: 0, durationSec: null, outputExists: true, preset: "draft", status: "cancelled" })).toBe("cancelled · excluded");
    expect(truncateFilename("final-2026-05-06-1530.mp4", 18)).toBe("final-20...530.mp4");
  });
});
