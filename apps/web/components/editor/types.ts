import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

export type EditorMediaItem = {
  mediaId: string;
  filename: string;
  kind: "image" | "video" | "audio" | "watermark_image" | "watermark_video";
  path: string;
  thumb_path?: string | null;
  thumb_url: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  size: number;
  hash?: string | null;
  import_mode: "copy" | "link" | "generated";
  imported_at: string;
  created_at?: string | null;
  importing?: boolean;
  import_progress?: number | null;
  import_error?: string | null;
};

export type EditorSelection = {
  itemId: string;
  layerId: string;
} | null;

export type EditorRenderJobStatus = "idle" | "queued" | "running" | "ready" | "failed" | "cancelled";

export type EditorRenderJob = {
  status: EditorRenderJobStatus;
  phase: string;
  progress: number;
  running: boolean;
  message?: string;
  outputPath?: string;
  renderId?: string;
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
