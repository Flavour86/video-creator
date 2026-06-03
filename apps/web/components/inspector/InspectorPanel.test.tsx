import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "./InspectorPanel";

const SENTENCES = [
  { index: 1, text: "First.", start_s: 0, end_s: 5, confidence_avg: 0.9 },
  { index: 2, text: "Second.", start_s: 5, end_s: 10, confidence_avg: 0.9 },
  { index: 3, text: "Third.", start_s: 10, end_s: 18, confidence_avg: 0.9 },
];

const FG_ITEM = {
  id: "item-fg",
  mediaId: "photo.jpg",
  sentences: [1, 2] as [number, number],
  start: 0,
  end: 10,
  motion: { kind: "ken_burns", easing: "ease_in_out" },
  transitions: { in: "fade", out: "cut" },
};

const FG_LAYER = {
  id: "layer-fg",
  kind: "fg" as const,
  name: "Foreground · z1",
  items: [FG_ITEM],
};

const SCHEDULED_BG_LAYER = {
  id: "layer-bg",
  kind: "bg" as const,
  name: "Background",
  items: [{
    id: "bg-scheduled",
    mediaIds: ["bg-red.png", "bg-video.mp4", "bg-blue.png"],
    schedule: [
      { id: "seg-red", mediaId: "bg-red.png", start: 0, end: 30, lockedDuration: false },
      { id: "seg-video", mediaId: "bg-video.mp4", start: 30, end: 34, lockedDuration: true },
      { id: "seg-blue", mediaId: "bg-blue.png", start: 34, end: 90, lockedDuration: false },
    ],
    sentences: [1, 3] as [number, number],
    start: 0,
    end: 90,
    motion: { kind: "none", easing: "linear" },
    transitions: { in: "cut", out: "cut" },
    crossfade: 0,
  }],
};

const BASE_PROPS = {
  selectedLayerId: "layer-fg",
  selectedItemId: "item-fg",
  layers: [FG_LAYER],
  sentences: SENTENCES,
  media: [{ filename: "photo.jpg", kind: "image" as const, thumb_url: "/t/photo.jpg" }],
  projectPath: "/tmp/proj",
  onLayersChange: vi.fn(),
  onOpenAssignEdit: vi.fn(),
  onDeselect: vi.fn(),
};

describe("InspectorPanel", () => {
  it("renders nothing when no item is selected", () => {
    const { container } = render(
      <InspectorPanel {...BASE_PROPS} selectedItemId={null} selectedLayerId={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected item sentence range", () => {
    render(<InspectorPanel {...BASE_PROPS} />);
    expect(screen.getByText(/s1–s2/)).toBeInTheDocument();
  });

  it("shows the motion kind in a dropdown", () => {
    render(<InspectorPanel {...BASE_PROPS} />);
    const motionSelect = screen.getByLabelText(/motion/i);
    expect((motionSelect as HTMLSelectElement).value).toBe("ken_burns");
  });

  it("shows easing dropdown with current value", () => {
    render(<InspectorPanel {...BASE_PROPS} />);
    const easingSelect = screen.getByLabelText(/easing/i);
    expect((easingSelect as HTMLSelectElement).value).toBe("ease_in_out");
  });

  it("calls onLayersChange immediately when motion is changed", () => {
    const onLayersChange = vi.fn();
    render(<InspectorPanel {...BASE_PROPS} onLayersChange={onLayersChange} />);
    fireEvent.change(screen.getByLabelText(/motion/i), { target: { value: "zoom_in" } });
    expect(onLayersChange).toHaveBeenCalledOnce();
    const [updatedLayers] = onLayersChange.mock.calls[0] as [Array<{ kind: string; items: Array<{ motion: { kind: string } }> }>];
    const fgLayer = updatedLayers.find((l) => l.kind === "fg");
    expect(fgLayer?.items[0].motion.kind).toBe("zoom_in");
  });

  it("calls onLayersChange when transition-in is changed", () => {
    const onLayersChange = vi.fn();
    render(<InspectorPanel {...BASE_PROPS} onLayersChange={onLayersChange} />);
    fireEvent.change(screen.getByLabelText(/transition in/i), { target: { value: "slide_left" } });
    expect(onLayersChange).toHaveBeenCalledOnce();
  });

  it("removes the item and empty layer when Delete is clicked", () => {
    const onLayersChange = vi.fn();
    render(<InspectorPanel {...BASE_PROPS} onLayersChange={onLayersChange} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onLayersChange).toHaveBeenCalledOnce();
    const [updatedLayers] = onLayersChange.mock.calls[0] as [Array<{ kind: string }>];
    expect(updatedLayers.filter((l) => l.kind === "fg")).toHaveLength(0);
  });

  it("calls onDeselect after deleting the item", () => {
    const onDeselect = vi.fn();
    render(<InspectorPanel {...BASE_PROPS} onDeselect={onDeselect} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it("calls onOpenAssignEdit when asset thumbnail is clicked", () => {
    const onOpenAssignEdit = vi.fn();
    render(<InspectorPanel {...BASE_PROPS} onOpenAssignEdit={onOpenAssignEdit} />);
    fireEvent.click(screen.getByAltText("photo.jpg"));
    expect(onOpenAssignEdit).toHaveBeenCalledWith("layer-fg", "item-fg", 1, 2);
  });

  it("shows ordered scheduled background ranges with locked native video duration", () => {
    render(
      <InspectorPanel
        {...BASE_PROPS}
        layers={[SCHEDULED_BG_LAYER]}
        media={[
          { filename: "bg-red.png", kind: "image", thumb_url: "/t/bg-red.jpg" },
          { filename: "bg-video.mp4", kind: "video", thumb_url: "/t/bg-video.jpg", duration: 4 },
          { filename: "bg-blue.png", kind: "image", thumb_url: "/t/bg-blue.jpg" },
        ]}
        selectedItemId="bg-scheduled"
        selectedLayerId="layer-bg"
      />,
    );

    expect(screen.getByText("Coverage schedule")).toBeInTheDocument();
    const red = screen.getByTestId("inspector-background-schedule-row-bg-red.png");
    const video = screen.getByTestId("inspector-background-schedule-row-bg-video.mp4");
    const blue = screen.getByTestId("inspector-background-schedule-row-bg-blue.png");
    expect(red).toHaveTextContent("bg-red.png");
    expect(red).toHaveTextContent("00:00-00:30");
    expect(red).toHaveTextContent("Image range");
    expect(video).toHaveTextContent("bg-video.mp4");
    expect(video).toHaveTextContent("00:30-00:34");
    expect(video).toHaveTextContent("Video 00:04 locked");
    expect(blue).toHaveTextContent("00:34-01:30");
    expect(red.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(video.compareDocumentPosition(blue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
