import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PreviewPlayer } from "./PreviewPlayer";
import type { Layer } from "@/lib/preview/resolveDisplay";

const BG: Layer = {
  id: "bg-1",
  kind: "bg",
  name: "Background",
  items: [{
    id: "item-1",
    mediaId: "bg.jpg",
    start: 0,
    end: 10,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    crossfade: 0,
    sentences: [1, 1],
  }],
};

it("renders empty state when no layers", () => {
  render(
    <PreviewPlayer
      currentTime={0}
      layers={[]}
      projectPath="/p"
      sentences={[]}
    />,
  );
  expect(screen.getByText(/No media/i)).toBeInTheDocument();
});

it("renders watermark above the preview", () => {
  render(
    <PreviewPlayer
      currentTime={0}
      layers={[]}
      projectPath="E:/project"
      sentences={[]}
      watermark={{ mediaId: "logo.png", posX: 100, posY: 100, scale: 0.08, opacity: 60 }}
    />,
  );

  const images = document.querySelectorAll("img");
  expect(images[0]?.getAttribute("src")).toContain("logo.png");
});

it("renders bg image when bg layer is present", () => {
  const { container } = render(
    <PreviewPlayer
      currentTime={0.5}
      layers={[BG]}
      projectPath="/p"
      sentences={[]}
    />,
  );
  const img = container.querySelector("img");
  expect(img).toBeTruthy();
  expect(img?.src).toContain("bg.jpg");
});

it("renders subtitle text when sentence is active", () => {
  render(
    <PreviewPlayer
      currentTime={0.5}
      layers={[]}
      projectPath="/p"
      sentences={[
        { index: 1, text: "Hello world.", start_s: 0, end_s: 1, confidence_avg: 0.9 },
      ]}
    />,
  );
  expect(screen.getByText("Hello world.")).toBeInTheDocument();
});
