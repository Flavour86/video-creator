import { paletteForSeed } from "@/lib/launcher/palettes";
import Image from "next/image";

type ProjectThumbProps = {
  seed: string;
  thumbnailPath?: string | null;
};

export function ProjectThumb({ seed, thumbnailPath }: ProjectThumbProps) {
  const palette = paletteForSeed(seed);
  const stripes = [...palette, palette[1], palette[0], palette[2]];
  const src = thumbnailPath ? thumbnailSrc(thumbnailPath) : "";

  return (
    <span className="relative grid h-[78px] overflow-hidden rounded-(--r-sm) bg-(--bg-4)">
      {src ? (
        <Image alt={`${seed} thumbnail`} className="h-full w-full object-cover" fill sizes="312px" src={src} unoptimized />
      ) : (
        <span aria-hidden="true" className="grid h-full grid-cols-3 gap-0.5" data-testid="project-thumb-fallback">
          {stripes.map((stripe, index) => (
            <span className="bg-(--bg-4)" key={`${stripe}-${index}`} style={{ background: stripe }} />
          ))}
        </span>
      )}
    </span>
  );
}

function thumbnailSrc(path: string): string {
  return path.startsWith("/") ? `/api/server${path}` : path;
}
