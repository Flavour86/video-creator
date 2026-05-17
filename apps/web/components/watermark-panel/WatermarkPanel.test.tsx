import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WatermarkPanel } from "./WatermarkPanel";

const MEDIA = [
  { mediaId: "logo.png", filename: "logo.png", kind: "image" as const, thumb_url: "/thumb/logo.jpg" },
  { mediaId: "clip.mp4", filename: "clip.mp4", kind: "video" as const, thumb_url: "/thumb/clip.jpg" },
];

describe("WatermarkPanel", () => {
  it("lists image and video media assets", () => {
    render(<WatermarkPanel media={MEDIA} onChange={vi.fn()} value={null} />);

    expect(screen.getByRole("option", { name: "logo.png" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "clip.mp4" })).toBeInTheDocument();
  });

  it("supports explicit on toggle then creates watermark from selected asset", () => {
    const onChange = vi.fn();
    render(<WatermarkPanel media={MEDIA} onChange={onChange} value={null} />);

    fireEvent.click(screen.getByRole("switch", { name: /watermark enabled/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "logo.png" } });

    expect(onChange).toHaveBeenCalledWith({
      mediaId: "logo.png",
      posX: 100,
      posY: 100,
      scale: 0.08,
      opacity: 60,
    });
  });

  it("shows watermark preview and supports removal", () => {
    const onChange = vi.fn();
    render(
      <WatermarkPanel
        media={MEDIA}
        onChange={onChange}
        value={{
          mediaId: "logo.png",
          opacity: 75,
          posX: 50,
          posY: 0,
          scale: 0.12,
        }}
      />,
    );

    expect(screen.getByTestId("watermark-preview")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview logo.png" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove watermark" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
