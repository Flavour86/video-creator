import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WatermarkPanel } from "./WatermarkPanel";

const MEDIA = [
  { filename: "logo.png", kind: "image" as const, thumb_url: "/thumb/logo.jpg" },
  { filename: "clip.mp4", kind: "video" as const, thumb_url: "" },
];

describe("WatermarkPanel", () => {
  it("lists image media and ignores video media", () => {
    render(<WatermarkPanel media={MEDIA} onChange={vi.fn()} value={null} />);

    expect(screen.getByRole("option", { name: "logo.png" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "clip.mp4" })).not.toBeInTheDocument();
  });

  it("creates a default watermark when media is selected", () => {
    const onChange = vi.fn();
    render(<WatermarkPanel media={MEDIA} onChange={onChange} value={null} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "logo.png" } });

    expect(onChange).toHaveBeenCalledWith({
      mediaId: "logo.png",
      posX: 100,
      posY: 100,
      scale: 0.08,
      opacity: 60,
    });
  });
});
