import { create } from "zustand";
import type { Project, ProjectConfigLoadResponse } from "@vc/shared-schemas";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";
import { normalizeBackgroundLayerSchedules } from "@/lib/preview/backgroundSchedule";

type ProjectStore = {
  projectId: string;
  projectPath: string;
  layers: Layer[];
  subtitles: SubtitlesSettings;
  watermark: WatermarkSettings | null;
  sentences: AlignedSentence[];
  duration: number;
  selectedLayerId: string | null;
  selectedItemId: string | null;
  setProjectId: (id: string) => void;
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

export type SubtitlesSettings = NonNullable<Project["subtitles"]>;

export const DEFAULT_SUBTITLES: SubtitlesSettings = {
  burn_in: false,
  style: {
    font: "Arial",
    size: 28,
    position: "bottom",
    max_chars_per_line: 42,
    bg_style: "shadow",
    color: "#ffffff",
    bg_color: "#000000",
    bg_opacity: 62,
    bg_radius: 8,
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
  projectId: "",
  projectPath: "",
  layers: [],
  subtitles: DEFAULT_SUBTITLES,
  watermark: null,
  sentences: [],
  duration: 0,
  selectedLayerId: null,
  selectedItemId: null,

  setProjectId: (id) => set({ projectId: id }),
  setProjectPath: (path) => set({ projectPath: path }),
  setLayers: (layers) => set({ layers: normalizeBackgroundLayerSchedules(layers) }),
  setSubtitles: (subtitles) => set({ subtitles: normalizeSubtitlesSettings(subtitles) }),
  setWatermark: (watermark) => set({ watermark: watermark ?? null }),
  setSentences: (sentences) => set({ sentences }),
  setDuration: (duration) => set({ duration }),
  setSelectedItem: (layerId, itemId) => set({ selectedLayerId: layerId, selectedItemId: itemId }),

  saveLayers: async (layers) => {
    const { projectId } = get();
    if (!projectId) return;
    const normalizedLayers = normalizeBackgroundLayerSchedules(layers);
    await saveConfigPatch(projectId, { layers: normalizedLayers as Project["layers"] });
    set({ layers: normalizedLayers });
  },

  saveSubtitles: async (burnIn) => {
    const { projectId } = get();
    if (!projectId) return;
    const subtitles = { ...DEFAULT_SUBTITLES, burn_in: burnIn };
    await saveConfigPatch(projectId, { subtitles: subtitles as Project["subtitles"] });
    set({ subtitles });
  },

  saveWatermark: async (watermark) => {
    const { projectId } = get();
    if (!projectId) return;
    await saveConfigPatch(projectId, { watermark: watermark as Project["watermark"] });
    set({ watermark });
  },
}));

function normalizeSubtitlesSettings(subtitles: SubtitlesSettings | null | undefined): SubtitlesSettings {
  if (!subtitles) return DEFAULT_SUBTITLES;
  return {
    burn_in: subtitles.burn_in,
    style: {
      ...DEFAULT_SUBTITLES.style,
      ...subtitles.style,
    },
  };
}

async function saveConfigPatch(projectId: string, patch: Partial<Project>): Promise<void> {
  if (!projectId) return;
  const current = await fetch(`/api/server/projects/${encodeURIComponent(projectId)}/config`);
  if (!current.ok) return;
  const { config } = (await current.json()) as ProjectConfigLoadResponse;
  const nextConfig: Project = { ...config, ...patch };
  const saved = await fetch(`/api/server/projects/${encodeURIComponent(projectId)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: nextConfig }),
  });
  if (!saved.ok) {
    throw new Error("Project config save failed.");
  }
}
