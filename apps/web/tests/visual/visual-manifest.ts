export type VisualOwner = "frontend-global" | "launcher" | "editor" | "render";
export type VisualCoverageStatus = "implemented" | "pending";

export type VisualManifestEntry = {
  screenshot: string;
  owner: VisualOwner;
  status: VisualCoverageStatus;
};

const v1_1EditorScreenshots = [
  "background-coverage-editor-1080x1920.png",
  "background-coverage-editor-1920x1080.png",
  "background-coverage-modal-clear-1080x1920.png",
  "background-coverage-modal-clear-1920x1080.png",
  "editor-dark-9x16.png",
  "editor-dark.png",
  "editor-light.png",
  "proto-subtitles-final-check.png",
  "proto-watermark-final-check.png",
  "subtitles-modal-color-bg-1080x1920.png",
  "subtitles-modal-color-bg-1920x1080.png",
  "subtitles-modal-none-disabled-1920x1080.png",
  "transcript-edit-height-parity-1080x1920.png",
  "transcript-edit-height-parity-1920x1080.png",
  "watermark-modal-dark.png",
  "watermark-modal-light.png",
].map((screenshot) => `docs/designs/tasks/v1.1/visuals/${screenshot}`);

export const visualManifest: VisualManifestEntry[] = [
  { screenshot: "docs/designs/visuals/shell-dark.png", owner: "frontend-global", status: "implemented" },
  { screenshot: "docs/designs/visuals/shell-light.png", owner: "frontend-global", status: "implemented" },

  { screenshot: "docs/designs/visuals/Launcher-dark.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Launcher-light.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Launcher-play-dark.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Launcher-play-light.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-dark.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-light.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-dark-srt.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment-success.png", owner: "launcher", status: "implemented" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment-selected.png", owner: "launcher", status: "implemented" },

  { screenshot: "docs/designs/visuals/editor-dark.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-draft-render-strip-dark.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-draft-render-strip-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-transcript-1.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-transcript-2.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-transcript-3.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-preview-dark.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-preview-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-preview-1.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-preview-popover.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-timeline-dark.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-timeline-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-inspector-dark.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-inspector-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-inspector-1.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/editor-inspector-2.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/AssignModal.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/AssignModal-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/AssignModal-light-1.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/change-background-light.png", owner: "editor", status: "implemented" },
  { screenshot: "docs/designs/visuals/SubtitleModal.png", owner: "editor", status: "implemented" },
  ...v1_1EditorScreenshots.map((screenshot) => ({
    screenshot,
    owner: "editor" as const,
    status: "implemented" as const,
  })),

  { screenshot: "docs/designs/visuals/render-dark.png", owner: "render", status: "implemented" },
  { screenshot: "docs/designs/visuals/render-light.png", owner: "render", status: "implemented" },
];
