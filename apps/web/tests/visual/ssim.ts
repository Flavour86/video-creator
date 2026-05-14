import { PNG } from "pngjs";
import { ssim } from "ssim.js";

export function calculateSsimFromPngBuffers(
  referencePng: Buffer,
  actualPng: Buffer,
): number {
  const reference = PNG.sync.read(referencePng);
  const actual = PNG.sync.read(actualPng);

  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(
      `Cannot compare images with different dimensions: ` +
        `reference=${reference.width}x${reference.height}, ` +
        `actual=${actual.width}x${actual.height}`,
    );
  }

  const { mssim } = ssim(toSsimImageData(reference), toSsimImageData(actual));
  return mssim;
}

type SsimImageData = {
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
};

function toSsimImageData(image: PNG): SsimImageData {
  return {
    data: new Uint8ClampedArray(image.data),
    height: image.height,
    width: image.width,
  };
}
