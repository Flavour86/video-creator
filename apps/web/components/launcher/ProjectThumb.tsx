import { paletteForSeed } from "@/lib/launcher/palettes";

type ProjectThumbProps = {
  seed: string;
};

export function ProjectThumb({ seed }: ProjectThumbProps) {
  const palette = paletteForSeed(seed);
  const stripes = [...palette, palette[1], palette[0], palette[2]];

  return (
    <span aria-hidden="true" className="relative grid h-[78px] grid-cols-3 gap-0.5 overflow-hidden rounded-(--r-sm)">
      {stripes.map((stripe, index) => (
        <span className="bg-(--bg-4)" key={`${stripe}-${index}`} style={{ background: stripe }} />
      ))}
    </span>
  );
}
