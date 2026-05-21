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
  ignoreRegions?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  blurRadius?: number;
  stateName?: string;
};

export async function compareScreenshots({
  threshold = DEFAULT_SSIM_THRESHOLD,
  referencePath,
  actualPath,
  ignoreRegions,
  blurRadius = 0,
  stateName,
}: VisualCompareOptions): Promise<number> {
  const [referenceBuffer, actualBuffer] = await Promise.all([
    fs.readFile(referencePath),
    fs.readFile(actualPath),
  ]);
  const referencePng = PNG.sync.read(referenceBuffer);
  const actualPng = PNG.sync.read(actualBuffer);
  if (ignoreRegions && ignoreRegions.length > 0) {
    applyIgnoredRegions(referencePng, ignoreRegions);
    applyIgnoredRegions(actualPng, ignoreRegions);
  }
  if (blurRadius > 0) {
    applyBoxBlur(referencePng, blurRadius);
    applyBoxBlur(actualPng, blurRadius);
  }
  const normalizedReference = PNG.sync.write(referencePng);
  const normalizedActual = PNG.sync.write(actualPng);

  const score = calculateSsimFromPngBuffers(normalizedReference, normalizedActual);
  if (score < threshold) {
    const prettyScore = score.toFixed(4);
    const prettyThreshold = threshold.toFixed(4);
    const diffPath = await writeDiffImage(normalizedReference, normalizedActual, actualPath);
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

function applyIgnoredRegions(png: PNG, regions: ReadonlyArray<{ x: number; y: number; width: number; height: number }>): void {
  for (const region of regions) {
    const startX = Math.max(0, Math.floor(region.x));
    const startY = Math.max(0, Math.floor(region.y));
    const endX = Math.min(png.width, Math.ceil(region.x + region.width));
    const endY = Math.min(png.height, Math.ceil(region.y + region.height));
    if (endX <= startX || endY <= startY) continue;
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = (y * png.width + x) * 4;
        png.data[index] = 0;
        png.data[index + 1] = 0;
        png.data[index + 2] = 0;
        png.data[index + 3] = 255;
      }
    }
  }
}

function applyBoxBlur(png: PNG, radius: number): void {
  const r = Math.max(1, Math.floor(radius));
  const source = Buffer.from(png.data);
  const { height, width } = png;
  const horizontal = new Float64Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    const rowOffset = y * width;
    const firstEndX = Math.min(width - 1, r);
    for (let x = 0; x <= firstEndX; x += 1) {
      const sourceIndex = (rowOffset + x) * 4;
      red += source[sourceIndex] ?? 0;
      green += source[sourceIndex + 1] ?? 0;
      blue += source[sourceIndex + 2] ?? 0;
      count += 1;
    }
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (rowOffset + x) * 3;
      const divisor = Math.max(1, count);
      horizontal[targetIndex] = red / divisor;
      horizontal[targetIndex + 1] = green / divisor;
      horizontal[targetIndex + 2] = blue / divisor;

      const removeX = x - r;
      if (removeX >= 0) {
        const sourceIndex = (rowOffset + removeX) * 4;
        red -= source[sourceIndex] ?? 0;
        green -= source[sourceIndex + 1] ?? 0;
        blue -= source[sourceIndex + 2] ?? 0;
        count -= 1;
      }
      const addX = x + r + 1;
      if (addX < width) {
        const sourceIndex = (rowOffset + addX) * 4;
        red += source[sourceIndex] ?? 0;
        green += source[sourceIndex + 1] ?? 0;
        blue += source[sourceIndex + 2] ?? 0;
        count += 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    const firstEndY = Math.min(height - 1, r);
    for (let y = 0; y <= firstEndY; y += 1) {
      const horizontalIndex = (y * width + x) * 3;
      red += horizontal[horizontalIndex] ?? 0;
      green += horizontal[horizontalIndex + 1] ?? 0;
      blue += horizontal[horizontalIndex + 2] ?? 0;
      count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      const targetIndex = (y * width + x) * 4;
      const divisor = Math.max(1, count);
      png.data[targetIndex] = Math.round(red / divisor);
      png.data[targetIndex + 1] = Math.round(green / divisor);
      png.data[targetIndex + 2] = Math.round(blue / divisor);
      png.data[targetIndex + 3] = 255;

      const removeY = y - r;
      if (removeY >= 0) {
        const horizontalIndex = (removeY * width + x) * 3;
        red -= horizontal[horizontalIndex] ?? 0;
        green -= horizontal[horizontalIndex + 1] ?? 0;
        blue -= horizontal[horizontalIndex + 2] ?? 0;
        count -= 1;
      }
      const addY = y + r + 1;
      if (addY < height) {
        const horizontalIndex = (addY * width + x) * 3;
        red += horizontal[horizontalIndex] ?? 0;
        green += horizontal[horizontalIndex + 1] ?? 0;
        blue += horizontal[horizontalIndex + 2] ?? 0;
        count += 1;
      }
    }
  }
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
  const cropped = new PNG({ width: reference.width, height: reference.height, fill: true });
  cropped.data.fill(0);
  const copyWidth = Math.min(reference.width, actual.width);
  const copyHeight = Math.min(reference.height, actual.height);
  PNG.bitblt(actual, cropped, 0, 0, copyWidth, copyHeight, 0, 0);
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
