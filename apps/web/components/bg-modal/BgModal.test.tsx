import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { BgModal } from "./BgModal";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const MEDIA = [
  {
    mediaId: "bg.jpg",
    filename: "bg.jpg",
    kind: "image" as const,
    thumb_url: "/thumb/bg.jpg",
    duration: null,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "bg-2.jpg",
    filename: "bg-2.jpg",
    kind: "image" as const,
    thumb_url: "/thumb/bg-2.jpg",
    duration: null,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "clip-a.mp4",
    filename: "clip-a.mp4",
    kind: "video" as const,
    thumb_url: "",
    duration: 4,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "clip-b.mp4",
    filename: "clip-b.mp4",
    kind: "video" as const,
    thumb_url: "",
    duration: 3,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "clip-long-a.mp4",
    filename: "clip-long-a.mp4",
    kind: "video" as const,
    thumb_url: "",
    duration: 6,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "clip-long-b.mp4",
    filename: "clip-long-b.mp4",
    kind: "video" as const,
    thumb_url: "",
    duration: 6,
    importing: false,
    import_error: null,
  },
];

function renderModal(
  overrides: Partial<Parameters<typeof BgModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onImport = vi.fn();
  const onSave = vi.fn();
  render(
    <BgModal
      duration={10}
      media={MEDIA}
      onClose={onClose}
      onImport={onImport}
      onSave={onSave}
      open
      totalSentences={6}
      {...overrides}
    />,
  );
  return { onClose, onImport, onSave };
}

describe("BgModal", () => {
  it("renders create mode and selected metadata", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Add background" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /bg\.jpg/i }));
    expect(screen.getByText("1 selected · images only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add background" })).toBeEnabled();
  });

  it("renders edit mode with existing selection", () => {
    renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-1",
          mediaId: "bg.jpg",
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns_subtle", easing: "ease_out" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0.5,
        }],
      },
    });
    expect(screen.getByRole("heading", { name: "Change background" })).toBeInTheDocument();
    expect(screen.getByText("1 selected · images only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("supports import from disk", () => {
    const { onImport } = renderModal();
    const fileInput = screen.getByLabelText("Import from disk");
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array([1])], "new-bg.jpg", { type: "image/jpeg" })] },
    });
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("locks kind selection and marks opposite-kind cards as will-replace", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /bg\.jpg/i }));
    const videoCard = screen.getByRole("button", { name: /clip-a\.mp4/i });
    expect(within(videoCard).getByText("Will replace")).toBeInTheDocument();
    fireEvent.click(videoCard);
    expect(screen.getByText("1 selected · clips only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clip-a\.mp4/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /bg\.jpg/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows invalid crossfade state and disables submit", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /bg\.jpg/i }));
    fireEvent.change(screen.getByLabelText(/crossfade/i), { target: { value: "2.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Crossfade must be between 0 and 2 seconds.");
    expect(screen.getByRole("button", { name: "Add background" })).toBeDisabled();
  });

  it("builds image playlists to evenly span full duration", () => {
    const { onSave } = renderModal({ duration: 12 });
    fireEvent.click(screen.getByRole("button", { name: /bg\.jpg/i }));
    fireEvent.click(screen.getByRole("button", { name: /bg-2\.jpg/i }));
    fireEvent.change(screen.getByLabelText(/crossfade/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(2);
    expect(layer.items[0]).toMatchObject({
      mediaId: "bg.jpg",
      start: 0,
      end: 7,
      transitions: { in: "cut", out: "fade" },
    });
    expect(layer.items[1]).toMatchObject({
      mediaId: "bg-2.jpg",
      start: 5,
      end: 12,
      transitions: { in: "fade", out: "cut" },
    });
  });

  it("builds video playlists in selected order and leaves black fallback when short", () => {
    const { onSave } = renderModal({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: /clip-a\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: /clip-b\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(2);
    expect(layer.items[0]).toMatchObject({ mediaId: "clip-a.mp4", start: 0, end: 4 });
    expect(layer.items[1]).toMatchObject({ mediaId: "clip-b.mp4", start: 4, end: 7 });
    expect(layer.items[1].end).toBeLessThan(10);
  });

  it("trims video playlists when total duration is longer than voice duration", () => {
    const { onSave } = renderModal({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: /clip-long-a\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: /clip-long-b\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(2);
    expect(layer.items[0]).toMatchObject({ mediaId: "clip-long-a.mp4", start: 0, end: 6 });
    expect(layer.items[1]).toMatchObject({ mediaId: "clip-long-b.mp4", start: 6, end: 10 });
  });
});
