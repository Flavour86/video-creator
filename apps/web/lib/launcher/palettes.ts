export type ProjectPalette = "warm" | "cool" | "night" | "olive";

export const PALETTES: Record<ProjectPalette, readonly [string, string, string]> = {
  warm: ["oklch(0.45 0.10 50)", "oklch(0.55 0.12 60)", "oklch(0.30 0.05 50)"],
  cool: ["oklch(0.32 0.06 230)", "oklch(0.45 0.10 250)", "oklch(0.25 0.04 240)"],
  night: ["oklch(0.22 0.04 280)", "oklch(0.30 0.06 290)", "oklch(0.18 0.03 270)"],
  olive: ["oklch(0.40 0.08 130)", "oklch(0.55 0.10 145)", "oklch(0.30 0.05 130)"],
};

const paletteKeys = Object.keys(PALETTES) as ProjectPalette[];

export function paletteForSeed(seed: string): readonly [string, string, string] {
  const normalized = seed.toLowerCase();
  if (normalized.includes("tokyo")) {
    return PALETTES.night;
  }
  if (normalized.includes("camera")) {
    return PALETTES.warm;
  }
  if (normalized.includes("lighting")) {
    return PALETTES.cool;
  }
  if (normalized.includes("shibuya")) {
    return PALETTES.olive;
  }

  const score = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PALETTES[paletteKeys[score % paletteKeys.length] ?? "night"];
}
