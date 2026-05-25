import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { WatermarkModal } from "./WatermarkModal";

const MEDIA = [
  {
    mediaId: "callout-map.png",
    filename: "callout-map.png",
    kind: "image" as const,
    path: "uploads/callout-map.png",
    thumb_path: "uploads/.thumbs/callout-map.jpg",
    thumb_url: "/uploads/thumb?filename=callout-map.jpg",
    width: 1280,
    height: 720,
    duration: null,
    size: 1024,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-26T00:00:00Z",
    created_at: null,
  },
  {
    mediaId: "station-intro.mp4",
    filename: "station-intro.mp4",
    kind: "video" as const,
    path: "uploads/station-intro.mp4",
    thumb_path: "uploads/.thumbs/station-intro.jpg",
    thumb_url: "/uploads/thumb?filename=station-intro.jpg",
    width: 1280,
    height: 720,
    duration: 4.2,
    size: 2048,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-26T00:00:01Z",
    created_at: null,
  },
];

function renderModal(overrides: Partial<ComponentProps<typeof WatermarkModal>> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onImport = vi.fn();
  render(
    <WatermarkModal
      media={MEDIA}
      onChange={onChange}
      onClose={onClose}
      onImport={onImport}
      open
      projectPath="E:/projects/test01"
      value={null}
      {...overrides}
    />,
  );
  return { onChange, onClose, onImport };
}

describe("WatermarkModal", () => {
  it("selects a watermark asset from the dialog grid", () => {
    const { onChange } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /callout-map\.png/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      mediaId: "callout-map.png",
      opacity: 85,
      posX: 9,
      posY: 11,
      scale: 0.08,
    }));
  });

  it("supports media import from upload action", () => {
    const { onImport } = renderModal();
    // Hidden file input has no accessible role in JSDOM, query directly.
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["abc"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImport).toHaveBeenCalled();
  });
});
