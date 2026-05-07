import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssignModal } from "./AssignModal";

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
      expect(screen.getByText("▶")).toBeInTheDocument();
    });
  });

  it("shows sentence range preview with time info", async () => {
    render(<AssignModal {...BASE_PROPS} fromSentence={1} toSentence={2} />);
    await waitFor(() => {
      expect(screen.getByText(/s1–s2/)).toBeInTheDocument();
    });
  });

  it("shows validation error when from > to", async () => {
    render(<AssignModal {...BASE_PROPS} fromSentence={3} toSentence={1} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() =>
      expect(screen.getByText(/"From" must be ≤ "To"/i)).toBeInTheDocument(),
    );
  });

  it("Confirm is disabled until an asset is selected", async () => {
    render(<AssignModal {...BASE_PROPS} />);
    await waitFor(() => screen.getByRole("dialog"));
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("calls onConfirm with a new FG layer when asset selected and Confirm clicked", async () => {
    const onConfirm = vi.fn();
    render(<AssignModal {...BASE_PROPS} onConfirm={onConfirm} />);
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByAltText("img.jpg").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

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

  it("shows overlap error when sentence range conflicts with existing item in same layer", async () => {
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
      />,
    );
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByAltText("img.jpg").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(screen.getByText(/overlap/i)).toBeInTheDocument(),
    );
  });
});
