import { create } from "zustand";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type ProjectStore = {
  projectPath: string;
  layers: Layer[];
  sentences: AlignedSentence[];
  duration: number;
  selectedLayerId: string | null;
  selectedItemId: string | null;
  setProjectPath: (path: string) => void;
  setLayers: (layers: Layer[]) => void;
  setSentences: (sentences: AlignedSentence[]) => void;
  setDuration: (duration: number) => void;
  setSelectedItem: (layerId: string | null, itemId: string | null) => void;
  saveLayers: (layers: Layer[]) => Promise<void>;
};

export const useProject = create<ProjectStore>((set, get) => ({
  projectPath: "",
  layers: [],
  sentences: [],
  duration: 0,
  selectedLayerId: null,
  selectedItemId: null,

  setProjectPath: (path) => set({ projectPath: path }),
  setLayers: (layers) => set({ layers }),
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
}));
