import { posix as pathPosix } from "node:path";

export const PAGE_SSIM_THRESHOLD = 0.45;
export const PREVIEW_SSIM_THRESHOLD = 0.6;
export const V1_1_VISUAL_REFERENCE_PREFIX = "../tasks/v1.1/visuals/";
export const V1_1_VISUAL_SSIM_THRESHOLD = 0.4;

export type EditorVisualTheme = "dark" | "light";
export type EditorVisualCaptureTarget =
  | "page"
  | "preview"
  | "timeline"
  | "inspector"
  | "transcript"
  | "dialog"
  | "watermark-dialog";
export type EditorVisualAction =
  | "none"
  | "render-draft"
  | "transcript-selection-range"
  | "transcript-context-menu"
  | "transcript-merge-action"
  | "preview-9x16"
  | "preview-layers-popover"
  | "inspector-dark"
  | "inspector-light"
  | "inspector-foreground"
  | "assign-modal"
  | "assign-modal-edit"
  | "assign-modal-edit-scrolled"
  | "assign-modal-scrolled"
  | "background-modal"
  | "subtitles-modal"
  | "watermark-modal"
  | "v1-background-coverage-editor"
  | "v1-background-coverage-modal"
  | "v1-subtitles-modal-color-bg"
  | "v1-subtitles-modal-none"
  | "v1-transcript-edit"
  | "v1-watermark-modal";

export type EditorVisualCase = {
  action: EditorVisualAction;
  blurRadius?: number;
  capture: EditorVisualCaptureTarget;
  clip?: { height: number; width: number; x: number; y: number };
  referenceClip?: { height: number; width: number; x: number; y: number };
  name: string;
  reference: string;
  strict?: boolean;
  threshold?: number;
  theme: EditorVisualTheme;
  inventory?: boolean;
  deviceScaleFactor?: number;
  viewport?: { height: number; width: number };
};

export const EDITOR_VISUAL_CASES: EditorVisualCase[] = [
  { action: "none", name: "default editor dark", reference: "editor-dark.png", theme: "dark", threshold: PAGE_SSIM_THRESHOLD, capture: "page" },
  { action: "none", name: "default editor light", reference: "editor-light.png", theme: "light", threshold: PAGE_SSIM_THRESHOLD, capture: "page" },
  { action: "render-draft", name: "draft render strip dark", reference: "editor-draft-render-strip-dark.png", theme: "dark", threshold: PAGE_SSIM_THRESHOLD, capture: "page" },
  { action: "render-draft", name: "draft render strip light", reference: "editor-draft-render-strip-light.png", theme: "light", threshold: PAGE_SSIM_THRESHOLD, capture: "page" },
  { action: "transcript-selection-range", name: "transcript selection range", reference: "editor-transcript-1.png", theme: "dark", capture: "transcript" },
  {
    action: "transcript-context-menu",
    name: "transcript context menu",
    reference: "editor-transcript-2.png",
    theme: "dark",
    capture: "dialog",
    clip: { x: 4, y: 300, width: 548, height: 299 },
  },
  {
    action: "transcript-merge-action",
    name: "transcript merge action",
    reference: "editor-transcript-3.png",
    theme: "dark",
    capture: "dialog",
    clip: { x: 0, y: 251, width: 607, height: 537 },
  },
  { action: "none", name: "preview dark", reference: "editor-preview-dark.png", theme: "dark", threshold: PREVIEW_SSIM_THRESHOLD, capture: "preview" },
  { action: "none", name: "preview light", reference: "editor-preview-light.png", theme: "light", threshold: PREVIEW_SSIM_THRESHOLD, capture: "preview" },
  { action: "preview-9x16", name: "preview 9:16", reference: "editor-preview-1.png", theme: "dark", threshold: PREVIEW_SSIM_THRESHOLD, capture: "preview" },
  {
    action: "preview-layers-popover",
    name: "preview layers popover",
    reference: "editor-preview-popover.png",
    theme: "dark",
    threshold: PREVIEW_SSIM_THRESHOLD,
    capture: "preview",
  },
  { action: "none", name: "timeline dark", reference: "editor-timeline-dark.png", theme: "dark", capture: "timeline" },
  { action: "none", name: "timeline light", reference: "editor-timeline-light.png", theme: "light", capture: "timeline" },
  { action: "inspector-dark", name: "inspector dark", reference: "editor-inspector-dark.png", theme: "dark", capture: "inspector" },
  { action: "inspector-light", name: "inspector light", reference: "editor-inspector-light.png", theme: "light", threshold: 0.87, capture: "inspector" },
  { action: "none", name: "inspector background", reference: "editor-inspector-1.png", theme: "dark", threshold: 0.89, capture: "inspector" },
  { action: "inspector-foreground", name: "inspector foreground", reference: "editor-inspector-2.png", theme: "dark", threshold: 0.89, capture: "inspector" },
  { action: "assign-modal", name: "assign modal dark", reference: "AssignModal.png", theme: "dark", capture: "dialog" },
  { action: "assign-modal", name: "assign modal light", reference: "AssignModal-light.png", theme: "light", capture: "dialog" },
  { action: "assign-modal-scrolled", name: "assign modal light scrolled", reference: "AssignModal-light-1.png", theme: "light", capture: "dialog" },
  { action: "background-modal", name: "background modal light", reference: "change-background-light.png", theme: "light", capture: "dialog" },
  { action: "subtitles-modal", name: "subtitles modal dark", reference: "SubtitleModal.png", theme: "dark", capture: "dialog" },
  {
    action: "none",
    capture: "timeline",
    inventory: false,
    name: "bug 27 multiple overlay timeline rows",
    reference: "../bugs/vp_live/bug-27-1.png",
    blurRadius: 16,
    strict: true,
    threshold: 0.9,
    theme: "dark",
  },
  {
    action: "watermark-modal",
    blurRadius: 4,
    capture: "watermark-dialog",
    inventory: false,
    name: "bug 28 watermark modal",
    reference: "../bugs/vp_live/bug-28-1.png",
    referenceClip: { x: 961, y: 365, width: 841, height: 794 },
    strict: true,
    threshold: 0.9,
    theme: "dark",
  },
];

export const V1_1_EDITOR_VISUAL_CASES: EditorVisualCase[] = [
  {
    action: "none",
    capture: "page",
    name: "v1.1 editor dark",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}editor-dark.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1538, height: 1054 },
  },
  {
    action: "none",
    capture: "page",
    name: "v1.1 editor light",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}editor-light.png`,
    theme: "light",
    threshold: 0.25,
    deviceScaleFactor: 1.5,
    viewport: { width: 1276, height: 873 },
  },
  {
    action: "preview-9x16",
    capture: "page",
    name: "v1.1 editor dark 9:16",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}editor-dark-9x16.png`,
    theme: "dark",
    threshold: 0.25,
    deviceScaleFactor: 1.5,
    viewport: { width: 1276, height: 873 },
  },
  {
    action: "v1-subtitles-modal-color-bg",
    capture: "page",
    name: "v1.1 subtitles modal color background desktop",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}subtitles-modal-color-bg-1920x1080.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1920, height: 1080 },
  },
  {
    action: "v1-subtitles-modal-color-bg",
    capture: "page",
    name: "v1.1 subtitles modal color background portrait",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}subtitles-modal-color-bg-1080x1920.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1080, height: 1920 },
  },
  {
    action: "v1-subtitles-modal-none",
    capture: "page",
    name: "v1.1 subtitles modal none disabled",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}subtitles-modal-none-disabled-1920x1080.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1472, height: 1102 },
  },
  {
    action: "v1-subtitles-modal-color-bg",
    capture: "page",
    name: "v1.1 subtitles prototype final check",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}proto-subtitles-final-check.png`,
    theme: "dark",
    threshold: 0.25,
    deviceScaleFactor: 1.5,
    viewport: { width: 1276, height: 875 },
  },
  {
    action: "v1-watermark-modal",
    capture: "page",
    name: "v1.1 watermark modal dark",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}watermark-modal-dark.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1538, height: 1054 },
  },
  {
    action: "v1-watermark-modal",
    capture: "page",
    name: "v1.1 watermark modal light",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}watermark-modal-light.png`,
    theme: "light",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1276, height: 874 },
  },
  {
    action: "v1-watermark-modal",
    capture: "page",
    name: "v1.1 watermark prototype final check",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}proto-watermark-final-check.png`,
    theme: "dark",
    threshold: 0.25,
    deviceScaleFactor: 1.5,
    viewport: { width: 1276, height: 875 },
  },
  {
    action: "v1-transcript-edit",
    capture: "page",
    name: "v1.1 transcript edit height desktop",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}transcript-edit-height-parity-1920x1080.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1920, height: 1080 },
  },
  {
    action: "v1-transcript-edit",
    capture: "page",
    name: "v1.1 transcript edit height portrait",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}transcript-edit-height-parity-1080x1920.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1080, height: 1920 },
  },
  {
    action: "v1-background-coverage-modal",
    capture: "page",
    name: "v1.1 background coverage modal desktop",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}background-coverage-modal-clear-1920x1080.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1920, height: 1080 },
  },
  {
    action: "v1-background-coverage-modal",
    capture: "page",
    name: "v1.1 background coverage modal portrait",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}background-coverage-modal-clear-1080x1920.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    viewport: { width: 1080, height: 1920 },
  },
  {
    action: "v1-background-coverage-editor",
    capture: "page",
    name: "v1.1 background coverage editor desktop",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}background-coverage-editor-1920x1080.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1921, height: 1080 },
  },
  {
    action: "v1-background-coverage-editor",
    capture: "page",
    name: "v1.1 background coverage editor portrait",
    reference: `${V1_1_VISUAL_REFERENCE_PREFIX}background-coverage-editor-1080x1920.png`,
    theme: "dark",
    threshold: V1_1_VISUAL_SSIM_THRESHOLD,
    deviceScaleFactor: 1.5,
    viewport: { width: 1081, height: 1312 },
  },
];

export function editorVisualScreenshotPath(reference: string): string {
  return pathPosix.normalize(`docs/designs/visuals/${reference}`);
}

export const EDITOR_VISUAL_SCREENSHOTS = EDITOR_VISUAL_CASES.filter((visualCase) => visualCase.inventory !== false).map(
  (visualCase) => editorVisualScreenshotPath(visualCase.reference),
);

export const V1_1_EDITOR_VISUAL_SCREENSHOTS = V1_1_EDITOR_VISUAL_CASES.filter((visualCase) => visualCase.inventory !== false).map(
  (visualCase) => editorVisualScreenshotPath(visualCase.reference),
);
