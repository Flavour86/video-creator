export const PAGE_SSIM_THRESHOLD = 0.45;
export const PREVIEW_SSIM_THRESHOLD = 0.6;

export type EditorVisualTheme = "dark" | "light";
export type EditorVisualCaptureTarget = "page" | "preview" | "timeline" | "inspector" | "transcript" | "dialog";
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
  | "subtitles-modal";

export type EditorVisualCase = {
  action: EditorVisualAction;
  capture: EditorVisualCaptureTarget;
  clip?: { height: number; width: number; x: number; y: number };
  name: string;
  reference: string;
  threshold?: number;
  theme: EditorVisualTheme;
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
  { action: "inspector-light", name: "inspector light", reference: "editor-inspector-light.png", theme: "light", capture: "inspector" },
  { action: "none", name: "inspector background", reference: "editor-inspector-1.png", theme: "dark", capture: "inspector" },
  { action: "inspector-foreground", name: "inspector foreground", reference: "editor-inspector-2.png", theme: "dark", capture: "inspector" },
  { action: "assign-modal", name: "assign modal dark", reference: "AssignModal.png", theme: "dark", capture: "dialog" },
  { action: "assign-modal-edit", name: "assign modal light", reference: "AssignModal-light.png", theme: "light", capture: "dialog" },
  { action: "assign-modal-edit-scrolled", name: "assign modal light scrolled", reference: "AssignModal-light-1.png", theme: "light", capture: "dialog" },
  { action: "background-modal", name: "background modal light", reference: "change-background-light.png", theme: "light", capture: "dialog" },
  { action: "subtitles-modal", name: "subtitles modal dark", reference: "SubtitleModal.png", theme: "dark", capture: "dialog" },
];

export const EDITOR_VISUAL_SCREENSHOTS = EDITOR_VISUAL_CASES.map(
  (visualCase) => `docs/designs/visuals/${visualCase.reference}`,
);
