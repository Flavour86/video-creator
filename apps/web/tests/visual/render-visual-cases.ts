export const RENDER_PAGE_SSIM_THRESHOLD = 0.6;

export type RenderVisualTheme = "dark" | "light";
export type RenderVisualState =
  | "idle"
  | "queued"
  | "verifying"
  | "prerender"
  | "subtitles"
  | "composing"
  | "muxing"
  | "loggingHistory"
  | "done"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "outputMissing"
  | "partialExcluded"
  | "ffmpegWarning"
  | "ffmpegFatalError"
  | "historyEmpty"
  | "afterRenderActions";

export type RenderVisualCase = {
  name: string;
  reference: string;
  state: RenderVisualState;
  theme: RenderVisualTheme;
};

export type RenderStateCase = {
  expectedText: string | RegExp;
  name: string;
  state: RenderVisualState;
};

export const RENDER_VISUAL_CASES: RenderVisualCase[] = [
  { name: "render dark active", reference: "render-dark.png", state: "composing", theme: "dark" },
  { name: "render light active", reference: "render-light.png", state: "composing", theme: "light" },
];

export const RENDER_STATE_CASES: RenderStateCase[] = [
  { name: "idle/no active job", state: "idle", expectedText: "No render in progress" },
  { name: "queued", state: "queued", expectedText: "Render queued" },
  { name: "verify alignment cache", state: "verifying", expectedText: "Verifying alignment cache" },
  { name: "pre-render cached clips", state: "prerender", expectedText: "Pre-rendering clips" },
  { name: "build subtitles", state: "subtitles", expectedText: "Building subtitles" },
  { name: "compose filtergraph", state: "composing", expectedText: "Composing 1080p MP4" },
  { name: "mux faststart", state: "muxing", expectedText: "Muxing 1080p MP4" },
  { name: "append render history", state: "loggingHistory", expectedText: "Logging render history" },
  { name: "done", state: "done", expectedText: "Final render ready" },
  { name: "cancelling", state: "cancelling", expectedText: "Cancelling render" },
  { name: "cancelled", state: "cancelled", expectedText: "Render cancelled" },
  { name: "failed", state: "failed", expectedText: "Render failed" },
  { name: "output missing", state: "outputMissing", expectedText: "Render output missing" },
  { name: "partial output excluded", state: "partialExcluded", expectedText: "Partial output excluded" },
  { name: "ffmpeg warning", state: "ffmpegWarning", expectedText: "ffmpeg warning" },
  { name: "ffmpeg fatal error", state: "ffmpegFatalError", expectedText: "ffmpeg fatal error" },
  { name: "history empty", state: "historyEmpty", expectedText: "No renders yet." },
  { name: "after-render actions", state: "afterRenderActions", expectedText: "Play locally" },
];

export const RENDER_VISUAL_SCREENSHOTS = RENDER_VISUAL_CASES.map(
  (visualCase) => `docs/designs/visuals/${visualCase.reference}`,
);
