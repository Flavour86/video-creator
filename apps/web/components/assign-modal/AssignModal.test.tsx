import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { AssignModal } from "./AssignModal";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const SENTENCES = [
  { index: 1, text: "First sentence.", start_s: 0, end_s: 5, confidence_avg: 0.9 },
  { index: 2, text: "Second sentence.", start_s: 5, end_s: 10, confidence_avg: 0.9 },
  { index: 3, text: "Third sentence.", start_s: 10, end_s: 18, confidence_avg: 0.9 },
  { index: 4, text: "Fourth sentence.", start_s: 18, end_s: 25, confidence_avg: 0.9 },
];

const MEDIA = [
  { filename: "img.jpg", kind: "image" as const, thumb_url: "/thumbs/img.jpg" },
  { filename: "clip.mp4", kind: "video" as const, thumb_url: "" },
];

const BASE_PROPS = {
  open: true,
  fromSentence: 1,
  toSentence: 2,
  editItemId: undefined,
  editLayerId: undefined,
  media: MEDIA,
  sentences: SENTENCES,
  layers: [],
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

describe("AssignModal", () => {
  it("does not render when open is false", () => {
    render(<AssignModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when open is true", async () => {
    render(<AssignModal {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("shows media items in the asset picker", async () => {
    render(<AssignModal {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByAltText("img.jpg")).toBeInTheDocument();
      expect(screen.getAllByText("MP4").length).toBeGreaterThan(0);
    });
  });

  it("shows sentence range preview with time info", async () => {
    render(<AssignModal {...BASE_PROPS} fromSentence={1} toSentence={2} />);
    await waitFor(() => {
      expect(screen.getByText(/0:00\.0–0:10\.0/)).toBeInTheDocument();
      expect(screen.getByText("First sentence.")).toBeInTheDocument();
    });
  });

  it("shows validation error when from > to", async () => {
    render(<AssignModal {...BASE_PROPS} fromSentence={3} toSentence={1} />);
    await waitFor(() =>
      expect(screen.getByText(/"From" must be ≤ "To"/i)).toBeInTheDocument(),
    );
  });

  it("Confirm is disabled until an asset is selected", async () => {
    render(<AssignModal {...BASE_PROPS} />);
    await waitFor(() => screen.getByRole("dialog"));
    const confirmBtn = screen.getByRole("button", { name: /add to project/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("calls onConfirm with a new FG layer when asset selected and Confirm clicked", async () => {
    const onConfirm = vi.fn();
    render(<AssignModal {...BASE_PROPS} onConfirm={onConfirm} />);
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByAltText("img.jpg").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /add to project/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
      const [updatedLayers] = onConfirm.mock.calls[0] as [unknown[], string, string];
      const fgLayer = (updatedLayers as Array<{ kind: string; items: unknown[] }>).find(
        (l) => l.kind === "fg",
      );
      expect(fgLayer).toBeDefined();
      expect(fgLayer!.items).toHaveLength(1);
    });
  });

  it("defaults to a new layer when an existing foreground layer has an overlapping range", async () => {
    const onConfirm = vi.fn();
    const existingLayer = {
      id: "L-fg-1",
      kind: "fg" as const,
      name: "Foreground · z1",
      items: [
        {
          id: "item-1",
          mediaId: "other.jpg",
          sentences: [1, 3] as [number, number],
          start: 0,
          end: 18,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
        },
      ],
    };

    render(
      <AssignModal
        {...BASE_PROPS}
        fromSentence={2}
        toSentence={4}
        layers={[existingLayer]}
        onConfirm={onConfirm}
      />,
    );
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByAltText("img.jpg").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /add to project/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const [updatedLayers] = onConfirm.mock.calls[0] as [Array<{ kind: string; items: unknown[] }>, string, string];
    expect(updatedLayers.filter((layer) => layer.kind === "fg")).toHaveLength(2);
    expect(screen.queryByText(/overlap/i)).not.toBeInTheDocument();
  });

  it("marks edited item cache invalid when edit mode changes clip fields", async () => {
    const onConfirm = vi.fn();
    const existingLayer = {
      id: "L-fg-1",
      kind: "fg" as const,
      name: "Foreground · z1",
      items: [
        {
          id: "item-1",
          mediaId: "img.jpg",
          sentences: [1, 2] as [number, number],
          start: 0,
          end: 10,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          cache_status: "warm" as const,
        },
      ],
    };
    render(
      <AssignModal
        {...BASE_PROPS}
        editItemId="item-1"
        editLayerId="L-fg-1"
        layers={[existingLayer]}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText("Motion"), { target: { value: "zoom_in" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
      const [updatedLayers] = onConfirm.mock.calls[0] as [Array<{ id: string; items: Array<Record<string, unknown>> }>, string, string];
      const layer = updatedLayers.find((entry) => entry.id === "L-fg-1");
      expect(layer?.items[0]?.motion).toEqual({ kind: "zoom_in", easing: "linear" });
      expect(layer?.items[0]?.cache_status).toBe("invalid");
    });
  });

  it("preserves cache status when edit mode confirms without changes", async () => {
    const onConfirm = vi.fn();
    const existingLayer = {
      id: "L-fg-1",
      kind: "fg" as const,
      name: "Foreground · z1",
      items: [
        {
          id: "item-1",
          mediaId: "img.jpg",
          sentences: [1, 2] as [number, number],
          start: 0,
          end: 10,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          cache_status: "warm" as const,
        },
      ],
    };
    render(
      <AssignModal
        {...BASE_PROPS}
        editItemId="item-1"
        editLayerId="L-fg-1"
        layers={[existingLayer]}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
      const [updatedLayers] = onConfirm.mock.calls[0] as [Array<{ id: string; items: Array<Record<string, unknown>> }>, string, string];
      const layer = updatedLayers.find((entry) => entry.id === "L-fg-1");
      expect(layer?.items[0]?.cache_status).toBe("warm");
    });
  });

  it("moves an edited item when compositing changes without leaving the original clip behind", async () => {
    const onConfirm = vi.fn();
    const existingPipLayer = {
      id: "L-pip-1",
      kind: "pip" as const,
      name: "PiP · z1",
      items: [
        {
          id: "item-1",
          mediaId: "img.jpg",
          sentences: [1, 2] as [number, number],
          start: 0,
          end: 10,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          pip: { opacity: 100, posX: 88, posY: 88, radius: 12, size: 30 },
          cache_status: "warm" as const,
        },
      ],
    };
    render(
      <AssignModal
        {...BASE_PROPS}
        editItemId="item-1"
        editLayerId="L-pip-1"
        layers={[existingPipLayer]}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /fullscreen/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const [updatedLayers] = onConfirm.mock.calls[0] as [Array<{ id: string; kind: string; items: Array<Record<string, unknown>> }>, string, string];
    expect(updatedLayers.find((layer) => layer.id === "L-pip-1")).toBeUndefined();
    const fgLayer = updatedLayers.find((layer) => layer.kind === "fg");
    expect(fgLayer?.items).toHaveLength(1);
    expect(fgLayer?.items[0]).toMatchObject({
      id: "item-1",
      mediaId: "img.jpg",
      cache_status: "invalid",
    });
  });
});
