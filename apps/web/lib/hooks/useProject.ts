import { create } from "zustand";
import type { Layer } from "@/lib/preview/resolveDisplay";
import type { AlignedSentence } from "@/lib/hooks/useAlignment";

type ProjectStore = {
  projectPath: string;
  layers: Layer[];
  sentences: AlignedSentence[];
  duration: number;
  setProjectPath: (path: string) => void;
  setLayers: (layers: Layer[]) => void;
  setSentences: (sentences: AlignedSentence[]) => void;
  setDuration: (duration: number) => void;
  saveLayers: (layers: Layer[]) => Promise<void>;
};

export const useProject = create<ProjectStore>((set, get) => ({
  projectPath: "",
  layers: [],
  sentences: [],
  duration: 0,

  setProjectPath: (path) => set({ projectPath: path }),
  setLayers: (layers) => set({ layers }),
  setSentences: (sentences) => set({ sentences }),
  setDuration: (duration) => set({ duration }),

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
