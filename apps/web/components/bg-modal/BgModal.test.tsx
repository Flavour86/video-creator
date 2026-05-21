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
          motion: { kind: "ken_burns", easing: "ease_out" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0.5,
        }],
      },
    });
    expect(screen.getByRole("heading", { name: "Change background" })).toBeInTheDocument();
    expect(screen.getByText("1 selected · images only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("renders edit mode with existing mediaIds playlist selection", () => {
    renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-1",
          mediaId: "bg.jpg",
          mediaIds: ["bg.jpg", "bg-2.jpg"],
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0.5,
        }],
      },
    });
    expect(screen.getByText("2 selected · images only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bg\.jpg/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /bg-2\.jpg/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves a mediaIds-only background playlist when saving without changes", () => {
    const existing = {
      id: "bg-main",
      kind: "bg" as const,
      name: "Background",
      items: [{
        id: "bg-playlist",
        mediaIds: ["bg.jpg", "bg-2.jpg"],
        sentences: [1, 6] as [number, number],
        start: 0,
        end: 10,
        motion: { kind: "ken_burns", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        crossfade: 0,
        cache_status: "warm" as const,
      }],
    } as unknown as NonNullable<Parameters<typeof BgModal>[0]["existing"]>;
    const { onSave } = renderModal({ existing });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(existing);
  });

  it("rebuilds a mediaIds-only playlist when the existing timing is stale", () => {
    const existing = {
      id: "bg-main",
      kind: "bg" as const,
      name: "Background",
      items: [{
        id: "bg-playlist",
        mediaIds: ["bg.jpg", "bg-2.jpg"],
        sentences: [1, 6] as [number, number],
        start: 0,
        end: 8,
        motion: { kind: "ken_burns", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        crossfade: 0,
        cache_status: "warm" as const,
      }],
    } as unknown as NonNullable<Parameters<typeof BgModal>[0]["existing"]>;
    const { onSave } = renderModal({ existing, duration: 10 });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer).not.toBe(existing);
    expect(layer.items).toHaveLength(2);
    expect(layer.items[0]).toMatchObject({ mediaId: "bg.jpg", start: 0, end: 5 });
    expect(layer.items[1]).toMatchObject({ mediaId: "bg-2.jpg", start: 5, end: 10 });
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
    renderModal({
      existing: {
        id: "bg-main",
        type: "BG",
        items: [
          {
            id: "bg-invalid",
            source_ref: "asset-img-1",
            start: 0,
            end: 10,
            crossfade: 2.5,
            loop: true,
          },
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Crossfade must be between 0 and 2 seconds.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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

  it("preserves existing cache status for unchanged edited background strips", () => {
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [
          {
            id: "bg-1",
            mediaId: "bg.jpg",
            sentences: [1, 6],
            start: 0,
            end: 5,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "warm",
          },
          {
            id: "bg-2",
            mediaId: "bg-2.jpg",
            sentences: [1, 6],
            start: 5,
            end: 10,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "partial",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items[0]).toMatchObject({ id: "bg-1", cache_status: "warm" });
    expect(layer.items[1]).toMatchObject({ id: "bg-2", cache_status: "partial" });
  });

  it("invalidates edited background strips when playlist properties change", () => {
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [
          {
            id: "bg-1",
            mediaId: "bg.jpg",
            sentences: [1, 6],
            start: 0,
            end: 5,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "warm",
          },
          {
            id: "bg-2",
            mediaId: "bg-2.jpg",
            sentences: [1, 6],
            start: 5,
            end: 10,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "warm",
          },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText(/crossfade/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items[0]).toMatchObject({ id: "bg-1", cache_status: "invalid" });
    expect(layer.items[1]).toMatchObject({ id: "bg-2", cache_status: "invalid" });
  });
});
