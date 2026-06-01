import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    deletable: true,
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
  {
    mediaId: "watermark-role-scene.png",
    filename: "watermark-role-scene.png",
    kind: "image" as const,
    role: "watermark" as const,
    path: "uploads/watermark-role-scene.png",
    thumb_path: "uploads/.thumbs/watermark-role-scene.jpg",
    thumb_url: "/uploads/thumb?filename=watermark-role-scene.jpg",
    width: 1280,
    height: 720,
    duration: null,
    size: 1024,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-26T00:00:03Z",
    created_at: null,
    deletable: true,
  },
];

function renderModal(overrides: Partial<ComponentProps<typeof WatermarkModal>> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onDeleteMedia = vi.fn();
  const onImport = vi.fn();
  const onReorderMedia = vi.fn();
  render(
    <WatermarkModal
      media={MEDIA}
      onChange={onChange}
      onClose={onClose}
      onDeleteMedia={onDeleteMedia}
      onImport={onImport}
      onReorderMedia={onReorderMedia}
      open
      projectPath="E:/projects/test01"
      value={null}
      {...overrides}
    />,
  );
  return { onChange, onClose, onDeleteMedia, onImport, onReorderMedia };
}

function cardForButton(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name }).closest("[data-reorder-card='true']") as HTMLElement;
}

function mockElementsFromPoint(element: Element) {
  const original = document.elementsFromPoint;
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [element] });
  return () => {
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: original });
  };
}

function pointerEventWithPoint(type: "pointerDown" | "pointerMove" | "pointerUp", target: HTMLElement, clientX: number, clientY: number) {
  const event =
    type === "pointerDown"
      ? createEvent.pointerDown(target)
      : type === "pointerMove"
        ? createEvent.pointerMove(target)
        : createEvent.pointerUp(target);
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

function pointerDragTo(source: HTMLElement, target: HTMLElement) {
  const restore = mockElementsFromPoint(target);
  try {
    fireEvent(source, pointerEventWithPoint("pointerDown", source, 12, 18));
    fireEvent(source, pointerEventWithPoint("pointerMove", source, 36, 52));
    fireEvent(source, pointerEventWithPoint("pointerUp", source, 36, 52));
  } finally {
    restore();
  }
}

describe("WatermarkModal", () => {
  it("shows the current watermark plus other scoped replacement assets", () => {
    renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });
    expect(screen.getByRole("button", { name: /^callout-map\.png selected$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/^Selected$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /station-intro\.mp4/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^watermark-role-scene\.png$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^existing-scene\.png$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/video watermark/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("watermark-import-row")).toContainElement(screen.getByRole("switch", { name: /watermark enabled/i }));
    expect(screen.getByTestId("watermark-import-row")).toContainElement(screen.getByRole("button", { name: /Import from disk/i }));
    expect(document.querySelector("input[type='file']")).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp");
  });

  it("supports media import from upload action", () => {
    const { onImport } = renderModal();
    // Hidden file input has no accessible role in JSDOM, query directly.
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["abc"], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImport).toHaveBeenCalled();
  });

  it("renders a delete button on uploaded watermark cards", () => {
    const { onDeleteMedia } = renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete callout-map\.png/i }));

    expect(onDeleteMedia).toHaveBeenCalledWith("callout-map.png");
    expect(screen.queryByRole("button", { name: /delete existing-scene\.png/i })).not.toBeInTheDocument();
  });

  it("supports drag sorting the watermark asset picker order", async () => {
    const { onReorderMedia } = renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });

    pointerDragTo(cardForButton(/^watermark-role-scene\.png$/i), cardForButton(/^callout-map\.png selected$/i));

    await waitFor(() => expect(onReorderMedia).toHaveBeenCalledWith(["watermark-role-scene.png", "callout-map.png"]));
  });

  it("marks asset cards as motion-ready for animated reorder feedback", () => {
    renderModal();

    const card = screen.getByRole("button", { name: /^callout-map\.png$/i }).closest("[data-reorder-card='true']");

    expect(card).not.toBeNull();
    expect(card).toHaveClass("will-change-transform");
  });

  it("animates the active asset card while it is being dragged", () => {
    renderModal();

    const card = cardForButton(/^callout-map\.png$/i);

    fireEvent(card, pointerEventWithPoint("pointerDown", card, 12, 18));
    fireEvent(card, pointerEventWithPoint("pointerMove", card, 36, 52));

    expect(card).toHaveAttribute("data-drag-active", "true");
    expect(card).toHaveStyle({ transform: "translate3d(24px, 0px, 0) scale(1.03)" });
  });

  it("can create a watermark by selecting an existing asset when none is configured", () => {
    const { onChange } = renderModal({ value: null });

    fireEvent.click(screen.getByRole("button", { name: /^watermark-role-scene\.png$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, mediaId: "watermark-role-scene.png" }));
  });

  it("can replace an uploaded watermark by selecting another existing asset", () => {
    const { onChange } = renderModal({
      value: { mediaId: "callout-map.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 },
    });

    fireEvent.click(screen.getByRole("button", { name: /^watermark-role-scene\.png$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "watermark-role-scene.png", opacity: 85, posX: 9, posY: 11, scale: 0.08 }));
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
