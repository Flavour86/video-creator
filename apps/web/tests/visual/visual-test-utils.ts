import fs from "node:fs/promises";
import path from "node:path";

import { calculateSsimFromPngBuffers } from "./ssim";

export const DEFAULT_SSIM_THRESHOLD = 0.98;

export type VisualCompareOptions = {
  threshold?: number;
  referencePath: string;
  actualPath: string;
};

export async function compareScreenshots({
  threshold = DEFAULT_SSIM_THRESHOLD,
  referencePath,
  actualPath,
}: VisualCompareOptions): Promise<number> {
  const [referenceBuffer, actualBuffer] = await Promise.all([
    fs.readFile(referencePath),
    fs.readFile(actualPath),
  ]);

  const score = calculateSsimFromPngBuffers(referenceBuffer, actualBuffer);
  if (score < threshold) {
    const prettyScore = score.toFixed(4);
    const prettyThreshold = threshold.toFixed(4);
    throw new Error(
      [
        "Visual parity assertion failed.",
        `Reference: ${path.resolve(referencePath)}`,
        `Actual: ${path.resolve(actualPath)}`,
        `SSIM: ${prettyScore} (threshold: ${prettyThreshold})`,
      ].join("\n"),
    );
  }

  return score;
}
