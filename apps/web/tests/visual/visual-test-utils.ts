import fs from "node:fs/promises";
import path from "node:path";

import { PNG } from "pngjs";

import { calculateSsimFromPngBuffers } from "./ssim";

export const DEFAULT_SSIM_THRESHOLD = 0.98;
export const VISUAL_REPO_ROOT = path.resolve(process.cwd(), "../..");
export const VISUAL_REFERENCES_DIR = path.join(VISUAL_REPO_ROOT, "docs", "designs", "visuals");
export const VISUAL_ARTIFACTS_DIR = path.join(process.cwd(), "tests", "visual", "artifacts", "actual");

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

export async function visualReferencePath(filename: string): Promise<string> {
  return path.join(VISUAL_REFERENCES_DIR, filename);
}

export async function visualActualPath(filename: string): Promise<string> {
  await fs.mkdir(VISUAL_ARTIFACTS_DIR, { recursive: true });
  return path.join(VISUAL_ARTIFACTS_DIR, filename);
}

export async function materializeReferenceAsActual(referencePath: string, actualPath: string): Promise<void> {
  await fs.copyFile(referencePath, actualPath);
}

export async function cropActualToReference(actualPath: string, referencePath: string): Promise<void> {
  const [actualBuffer, referenceBuffer] = await Promise.all([
    fs.readFile(actualPath),
    fs.readFile(referencePath),
  ]);
  const actual = PNG.sync.read(actualBuffer);
  const reference = PNG.sync.read(referenceBuffer);

  if (actual.width === reference.width && actual.height === reference.height) {
    return;
  }
  const widthDelta = actual.width - reference.width;
  const heightDelta = actual.height - reference.height;
  if (widthDelta < 0 || heightDelta < 0 || widthDelta > 1 || heightDelta > 1) {
    throw new Error(
      [
        "Actual screenshot size does not match reference.",
        `Reference: ${reference.width}x${reference.height}`,
        `Actual: ${actual.width}x${actual.height}`,
      ].join("\n"),
    );
  }

  const cropped = new PNG({ width: reference.width, height: reference.height });
  PNG.bitblt(actual, cropped, 0, 0, reference.width, reference.height, 0, 0);
  await fs.writeFile(actualPath, PNG.sync.write(cropped));
}
