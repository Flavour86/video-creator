import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { WatermarkModal } from "./WatermarkModal";

const MEDIA = [
  {
    mediaId: "callout-map.png",
    filename: "callout-map.png",
    kind: "watermark_image" as const,
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
    kind: "watermark_video" as const,
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
  {
    mediaId: "existing-scene.png",
    filename: "existing-scene.png",
    kind: "image" as const,
    path: "media/existing-scene.png",
    thumb_path: "media/.thumbs/existing-scene.jpg",
    thumb_url: "/uploads/thumb?filename=existing-scene.jpg",
    width: 1280,
    height: 720,
    duration: null,
    size: 1024,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-26T00:00:02Z",
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
  it("shows the current watermark plus other available replacement assets", () => {
    renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });
    expect(screen.getByRole("button", { name: /callout-map\.png selected/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /station-intro\.mp4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /existing-scene\.png/i })).toBeInTheDocument();
    expect(document.querySelector("input[type='file']")).not.toHaveAttribute("multiple");
  });

  it("supports media import from upload action", () => {
    const { onImport } = renderModal();
    // Hidden file input has no accessible role in JSDOM, query directly.
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["abc"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImport).toHaveBeenCalled();
  });

  it("can create a watermark by selecting an existing asset when none is configured", () => {
    const { onChange } = renderModal({ value: null });

    fireEvent.click(screen.getByRole("button", { name: /existing-scene\.png/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, mediaId: "existing-scene.png" }));
  });

  it("can replace an uploaded watermark by selecting another existing asset", () => {
    const { onChange } = renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });

    fireEvent.click(screen.getByRole("button", { name: /existing-scene\.png/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "existing-scene.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 }));
  });

  it("shows no asset only when no watermark-compatible media exists", () => {
    renderModal({ media: [], value: null });
    expect(screen.getByText("No watermark assets selected yet.")).toBeInTheDocument();
  });

  it("disables display without clearing the selected watermark asset", () => {
    const value = { enabled: true, mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 };
    const { onChange } = renderModal({ value });

    fireEvent.click(screen.getByRole("switch", { name: /watermark enabled/i }));

    expect(onChange).toHaveBeenCalledWith({ ...value, enabled: false });
  });

  it("exposes scale, opacity, POSX, and POSY controls for the watermark itself", () => {
    const { onChange } = renderModal({
      value: { enabled: true, mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });

    fireEvent.change(screen.getByLabelText("Watermark size"), { target: { value: "0.16" } });
    fireEvent.change(screen.getByLabelText("Watermark opacity"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Watermark POSX"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Watermark POSY"), { target: { value: "70" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scale: 0.16 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ opacity: 42 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ posX: 30 }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ posY: 70 }));
  });
});
