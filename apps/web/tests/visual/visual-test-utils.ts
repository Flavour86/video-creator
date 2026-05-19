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
  stateName?: string;
};

export async function compareScreenshots({
  threshold = DEFAULT_SSIM_THRESHOLD,
  referencePath,
  actualPath,
  stateName,
}: VisualCompareOptions): Promise<number> {
  const [referenceBuffer, actualBuffer] = await Promise.all([
    fs.readFile(referencePath),
    fs.readFile(actualPath),
  ]);

  const score = calculateSsimFromPngBuffers(referenceBuffer, actualBuffer);
  if (score < threshold) {
    const prettyScore = score.toFixed(4);
    const prettyThreshold = threshold.toFixed(4);
    const diffPath = await writeDiffImage(referenceBuffer, actualBuffer, actualPath);
    throw new Error(
      [
        "Visual parity assertion failed.",
        stateName ? `State: ${stateName}` : null,
        `Reference: ${path.resolve(referencePath)}`,
        `Actual: ${path.resolve(actualPath)}`,
        `Diff: ${diffPath}`,
        `SSIM: ${prettyScore} (threshold: ${prettyThreshold})`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
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
  if (widthDelta < 0 || heightDelta < 0) {
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

async function writeDiffImage(referenceBuffer: Buffer, actualBuffer: Buffer, actualPath: string): Promise<string> {
  const reference = PNG.sync.read(referenceBuffer);
  const actual = PNG.sync.read(actualBuffer);
  const diffPath = actualPath.replace(/\.actual\.png$/i, ".diff.png");

  if (reference.width !== actual.width || reference.height !== actual.height) {
    return `${path.resolve(diffPath)} (not generated: size mismatch)`;
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  for (let index = 0; index < reference.data.length; index += 4) {
    const dr = Math.abs((reference.data[index] ?? 0) - (actual.data[index] ?? 0));
    const dg = Math.abs((reference.data[index + 1] ?? 0) - (actual.data[index + 1] ?? 0));
    const db = Math.abs((reference.data[index + 2] ?? 0) - (actual.data[index + 2] ?? 0));
    const delta = Math.max(dr, dg, db);
    diff.data[index] = delta;
    diff.data[index + 1] = 0;
    diff.data[index + 2] = 0;
    diff.data[index + 3] = delta > 0 ? 255 : 0;
  }

  await fs.writeFile(diffPath, PNG.sync.write(diff));
  return path.resolve(diffPath);
}
