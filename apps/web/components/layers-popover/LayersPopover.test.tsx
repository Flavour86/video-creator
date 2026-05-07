import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayersPopover } from "./LayersPopover";

const LAYERS = [
  { id: "L-sub", kind: "sub" as const, name: "Subtitles", items: [{}] as unknown[] },
  {
    id: "L-fg1",
    kind: "fg" as const,
    name: "Foreground · z1",
    items: [
      { id: "i1", mediaId: "a.jpg", sentences: [1, 2] as [number, number], start: 0, end: 10, motion: { kind: "none", easing: "linear" }, transitions: { in: "cut", out: "cut" } },
      { id: "i2", mediaId: "b.jpg", sentences: [4, 6] as [number, number], start: 20, end: 35, motion: { kind: "none", easing: "linear" }, transitions: { in: "cut", out: "cut" } },
    ],
  },
  { id: "L-bg", kind: "bg" as const, name: "Background", items: [{ id: "bg1", mediaId: "bg.jpg", sentences: [1, 10] as [number, number], start: 0, end: 60, motion: { kind: "none", easing: "linear" }, transitions: { in: "cut", out: "cut" }, crossfade: 0 }] },
];

const BASE_PROPS = {
  layers: LAYERS,
  selectedLayerId: null,
  selectedItemId: null,
  onSelectItem: vi.fn(),
  onDeleteLayer: vi.fn(),
  onAddItem: vi.fn(),
};

describe("LayersPopover", () => {
  it("renders a trigger button showing total item count across non-sub layers", () => {
    render(<LayersPopover {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /layers/i })).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("shows all layer names and item counts when opened", () => {
    render(<LayersPopover {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /layers/i }));
    expect(screen.getByText("Subtitles")).toBeInTheDocument();
    expect(screen.getByText("Foreground · z1")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("calls onAddItem when '+ Add layer item' is clicked", () => {
    const onAddItem = vi.fn();
    render(<LayersPopover {...BASE_PROPS} onAddItem={onAddItem} />);
    fireEvent.click(screen.getByRole("button", { name: /layers/i }));
    fireEvent.click(screen.getByRole("button", { name: /add layer item/i }));
    expect(onAddItem).toHaveBeenCalledOnce();
  });

  it("calls onDeleteLayer when trash icon clicked on a deletable layer", () => {
    const onDeleteLayer = vi.fn();
    render(<LayersPopover {...BASE_PROPS} onDeleteLayer={onDeleteLayer} />);
    fireEvent.click(screen.getByRole("button", { name: /layers/i }));
    const deleteButtons = screen.getAllByRole("button", { name: /delete layer/i });
    fireEvent.click(deleteButtons[0]!);
    expect(onDeleteLayer).toHaveBeenCalledOnce();
  });

  it("calls onSelectItem when a layer row is clicked", () => {
    const onSelectItem = vi.fn();
    render(<LayersPopover {...BASE_PROPS} onSelectItem={onSelectItem} />);
    fireEvent.click(screen.getByRole("button", { name: /layers/i }));
    fireEvent.click(screen.getByText("Foreground · z1"));
    expect(onSelectItem).toHaveBeenCalledWith("L-fg1", "i1");
  });
});
