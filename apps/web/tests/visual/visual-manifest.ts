export type VisualOwner = "frontend-global" | "launcher" | "editor" | "render";
export type VisualCoverageStatus = "implemented" | "pending";

export type VisualManifestEntry = {
  screenshot: string;
  owner: VisualOwner;
  status: VisualCoverageStatus;
};

export const visualManifest: VisualManifestEntry[] = [
  { screenshot: "docs/designs/visuals/shell-dark.png", owner: "frontend-global", status: "implemented" },
  { screenshot: "docs/designs/visuals/shell-light.png", owner: "frontend-global", status: "implemented" },

  { screenshot: "docs/designs/visuals/Launcher-dark.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Launcher-light.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Launcher-play-dark.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Launcher-play-light.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-dark.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-light.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-dark-srt.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment-success.png", owner: "launcher", status: "pending" },
  { screenshot: "docs/designs/visuals/Setup-dark-alignment-selected.png", owner: "launcher", status: "pending" },

  { screenshot: "docs/designs/visuals/editor-dark.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-draft-render-strip-dark.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-draft-render-strip-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-transcript-1.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-transcript-2.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-transcript-3.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-preview-dark.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-preview-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-preview-1.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-preview-popover.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-timeline-dark.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-timeline-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-inspector-dark.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-inspector-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-inspector-1.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/editor-inspector-2.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/AssignModal.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/AssignModal-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/AssignModal-light-1.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/change-background-light.png", owner: "editor", status: "pending" },
  { screenshot: "docs/designs/visuals/SubtitleModal.png", owner: "editor", status: "pending" },

  { screenshot: "docs/designs/visuals/render-dark.png", owner: "render", status: "pending" },
  { screenshot: "docs/designs/visuals/render-light.png", owner: "render", status: "pending" },
];
