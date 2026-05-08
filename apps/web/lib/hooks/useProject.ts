import { create } from "zustand";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type ProjectStore = {
  projectPath: string;
  layers: Layer[];
  subtitles: SubtitlesSettings;
  watermark: WatermarkSettings | null;
  sentences: AlignedSentence[];
  duration: number;
  selectedLayerId: string | null;
  selectedItemId: string | null;
  setProjectPath: (path: string) => void;
  setLayers: (layers: Layer[]) => void;
  setSubtitles: (subtitles: SubtitlesSettings | null | undefined) => void;
  setWatermark: (watermark: WatermarkSettings | null | undefined) => void;
  setSentences: (sentences: AlignedSentence[]) => void;
  setDuration: (duration: number) => void;
  setSelectedItem: (layerId: string | null, itemId: string | null) => void;
  saveLayers: (layers: Layer[]) => Promise<void>;
  saveSubtitles: (burnIn: boolean) => Promise<void>;
  saveWatermark: (watermark: WatermarkSettings | null) => Promise<void>;
};

export type SubtitlesSettings = {
  burn_in: boolean;
  style: {
    font: string;
    size: number;
    position: "bottom-center" | "top-center";
    max_chars_per_line: number;
    bg_style: "none" | "shadow" | "box";
  };
};

export const DEFAULT_SUBTITLES: SubtitlesSettings = {
  burn_in: false,
  style: {
    font: "Arial",
    size: 28,
    position: "bottom-center",
    max_chars_per_line: 42,
    bg_style: "shadow",
  },
};

export type WatermarkSettings = {
  mediaId: string;
  posX: number;
  posY: number;
  scale: number;
  opacity: number;
};

export const useProject = create<ProjectStore>((set, get) => ({
  projectPath: "",
  layers: [],
  subtitles: DEFAULT_SUBTITLES,
  watermark: null,
  sentences: [],
  duration: 0,
  selectedLayerId: null,
  selectedItemId: null,

  setProjectPath: (path) => set({ projectPath: path }),
  setLayers: (layers) => set({ layers }),
  setSubtitles: (subtitles) => set({ subtitles: subtitles ?? DEFAULT_SUBTITLES }),
  setWatermark: (watermark) => set({ watermark: watermark ?? null }),
  setSentences: (sentences) => set({ sentences }),
  setDuration: (duration) => set({ duration }),
  setSelectedItem: (layerId, itemId) => set({ selectedLayerId: layerId, selectedItemId: itemId }),

  saveLayers: async (layers) => {
    const { projectPath } = get();
    if (!projectPath) return;
    const r = await fetch(
      `/api/server/projects/layers?project=${encodeURIComponent(projectPath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layers }),
      },
    );
    if (r.ok) {
      const data = (await r.json()) as { layers: Layer[] };
      set({ layers: data.layers });
    }
  },

  saveSubtitles: async (burnIn) => {
    const { projectPath } = get();
    if (!projectPath) return;
    const r = await fetch(
      `/api/server/projects/subtitles?project=${encodeURIComponent(projectPath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ burn_in: burnIn }),
      },
    );
    if (r.ok) {
      const data = (await r.json()) as { subtitles: SubtitlesSettings };
      set({ subtitles: data.subtitles });
    }
  },

  saveWatermark: async (watermark) => {
    const { projectPath } = get();
    if (!projectPath) return;
    const r = await fetch(
      `/api/server/projects/watermark?project=${encodeURIComponent(projectPath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(watermark ?? { mediaId: null }),
      },
    );
    if (r.ok) {
      const data = (await r.json()) as { watermark: WatermarkSettings | null };
      set({ watermark: data.watermark });
    }
  },
}));
