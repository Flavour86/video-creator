import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

export type EditorMediaItem = {
  filename: string;
  kind: "image" | "video";
  size: number;
  thumb_url: string;
};

export type EditorSelection = {
  itemId: string;
  layerId: string;
} | null;

export type EditorRenderJob = {
  phase: string;
  progress: number;
  running: boolean;
};

export type EditorModal = "subtitles" | "background" | "upload" | null;

export type EditorStateProps = {
  activeRange: [number, number];
  currentTime: number;
  duration: number;
  layers: Layer[];
  media: EditorMediaItem[];
  projectPath: string;
  renderJob: EditorRenderJob;
  selected: EditorSelection;
  sentences: AlignedSentence[];
};
