import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    deletable: true,
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
  const onDeleteMedia = vi.fn();
  const onImport = vi.fn();
  const onReorderMedia = vi.fn();
  const onSave = vi.fn();
  render(
    <BgModal
      duration={10}
      media={MEDIA}
      onClose={onClose}
      onDeleteMedia={onDeleteMedia}
      onImport={onImport}
      onReorderMedia={onReorderMedia}
      onSave={onSave}
      open
      totalSentences={6}
      {...overrides}
    />,
  );
  return { onClose, onDeleteMedia, onImport, onReorderMedia, onSave };
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
    fireEvent(source, pointerEventWithPoint("pointerDown", source, 10, 20));
    fireEvent(source, pointerEventWithPoint("pointerMove", source, 36, 48));
    fireEvent(source, pointerEventWithPoint("pointerUp", source, 36, 48));
  } finally {
    restore();
  }
}

function mockCardRect(element: HTMLElement, left: number, width = 100) {
  const rect = {
    bottom: 80,
    height: 80,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => rect });
}

describe("BgModal", () => {
  it("renders create mode and selected metadata", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Add background" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    expect(screen.getByText("1 selected · images only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add background" })).toBeEnabled();
  });

  it("renders uploaded video thumbnails when available", () => {
    renderModal({
      media: MEDIA.map((item) => (
        item.mediaId === "clip-a.mp4"
          ? { ...item, thumb_url: "/uploads/thumb?filename=clip-a.jpg" }
          : item
      )),
    });

    expect(screen.getByRole("img", { name: "clip-a.mp4" })).toHaveAttribute(
      "src",
      "/api/server/uploads/thumb?filename=clip-a.jpg",
    );
  });

  it("hides failed pending uploads and excludes them from saved playlists", () => {
    const failedPending = {
      mediaId: "pending:video-2.mp4:10485760:1",
      filename: "video-2.mp4",
      kind: "video" as const,
      thumb_url: "",
      duration: null,
      importing: false,
      import_error: "upload failed (500)",
    };
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-1",
          mediaIds: [failedPending.mediaId, "clip-a.mp4", "clip-b.mp4"],
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0.5,
        }],
      },
      media: [failedPending, ...MEDIA],
    });

    expect(screen.queryByRole("button", { name: /video-2\.mp4/i })).not.toBeInTheDocument();
    expect(screen.getByText(/2 selected .* clips only/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ mediaIds: ["clip-a.mp4", "clip-b.mp4"] })],
    }));
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
    expect(screen.getByRole("button", { name: /^bg\.jpg selected$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^bg-2\.jpg selected$/i })).toHaveAttribute("aria-pressed", "true");
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
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0]).toMatchObject({
      mediaIds: ["bg.jpg", "bg-2.jpg"],
      start: 0,
      end: 10,
      transitions: { in: "cut", out: "cut" },
      cache_status: "invalid",
    });
    expect(layer.items[0].mediaId).toBeUndefined();
  });

  it("supports import from disk", () => {
    const { onImport } = renderModal();
    const fileInput = screen.getByLabelText("Import from disk");
    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array([1])], "new-bg.jpg", { type: "image/jpeg" })] },
    });
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("renders a delete button on uploaded background cards", () => {
    const { onDeleteMedia } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /delete bg\.jpg/i }));

    expect(onDeleteMedia).toHaveBeenCalledWith("bg.jpg");
    expect(screen.queryByRole("button", { name: /delete bg-2\.jpg/i })).not.toBeInTheDocument();
  });

  it("locks kind selection and marks opposite-kind cards as will-replace", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    const videoCard = screen.getByRole("button", { name: /^clip-a\.mp4$/i });
    expect(within(videoCard).getByText("Will replace")).toBeInTheDocument();
    fireEvent.click(videoCard);
    expect(screen.getByText("1 selected · clips only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^clip-a\.mp4 selected$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^bg\.jpg$/i })).toHaveAttribute("aria-pressed", "false");
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

  it("builds image playlists as a single full-duration background item", () => {
    const { onSave } = renderModal({ duration: 12 });
    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^bg-2\.jpg$/i }));
    fireEvent.change(screen.getByLabelText(/crossfade/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0]).toMatchObject({
      mediaIds: ["bg.jpg", "bg-2.jpg"],
      start: 0,
      end: 12,
      transitions: { in: "cut", out: "cut" },
      crossfade: 1,
    });
    expect(layer.items[0].mediaId).toBeUndefined();
  });

  it("builds video playlists as a single full-duration background item", () => {
    const { onSave } = renderModal({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: /^clip-a\.mp4$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clip-b\.mp4$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0]).toMatchObject({
      mediaIds: ["clip-a.mp4", "clip-b.mp4"],
      start: 0,
      end: 10,
    });
    expect(layer.items[0].mediaId).toBeUndefined();
  });

  it("drag-sorts selected assets and saves that order for the inspector playlist", async () => {
    const { onReorderMedia, onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [
          {
            id: "bg-playlist",
            mediaIds: ["clip-a.mp4", "clip-b.mp4"],
            sentences: [1, 6],
            start: 0,
            end: 10,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "warm",
          },
        ],
      },
    });

    pointerDragTo(cardForButton(/^clip-b\.mp4 selected$/i), cardForButton(/^clip-a\.mp4 selected$/i));

    await waitFor(() => expect(onReorderMedia).toHaveBeenCalledWith([
      "bg.jpg",
      "bg-2.jpg",
      "clip-b.mp4",
      "clip-a.mp4",
      "clip-long-a.mp4",
      "clip-long-b.mp4",
    ]));

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ mediaIds: ["clip-b.mp4", "clip-a.mp4"] })],
    }));
  });

  it("marks asset cards as motion-ready for animated reorder feedback", () => {
    renderModal();

    const card = screen.getByRole("button", { name: /^clip-a\.mp4$/i }).closest("[data-reorder-card='true']");
    const rail = document.querySelector("[data-reorder-rail='true']");

    expect(card).not.toBeNull();
    expect(card).toHaveClass("will-change-transform");
    expect(rail).toHaveClass("overflow-y-hidden");
  });

  it("animates the active asset card while it is being dragged", () => {
    renderModal();

    const card = cardForButton(/^clip-a\.mp4$/i);
    const setPointerCapture = vi.fn();
    Object.defineProperty(card, "setPointerCapture", { configurable: true, value: setPointerCapture });

    fireEvent(card, pointerEventWithPoint("pointerDown", card, 10, 20));
    fireEvent(card, pointerEventWithPoint("pointerMove", card, 34, 47));

    expect(card).toHaveAttribute("data-drag-active", "true");
    expect(card).toHaveStyle({ transform: "translate3d(24px, 0px, 0) scale(1.03)" });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("does not capture plain clicks so asset selection still works", () => {
    renderModal();

    const button = screen.getByRole("button", { name: /^bg\.jpg$/i });
    const card = cardForButton(/^bg\.jpg$/i);
    const setPointerCapture = vi.fn();
    Object.defineProperty(card, "setPointerCapture", { configurable: true, value: setPointerCapture });

    fireEvent(card, pointerEventWithPoint("pointerDown", card, 10, 20));
    fireEvent(card, pointerEventWithPoint("pointerUp", card, 10, 20));
    fireEvent.click(button);

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^bg\.jpg selected$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("shifts an overlapped neighbor into the dragged asset slot before drop", async () => {
    const { onReorderMedia } = renderModal();
    const source = cardForButton(/^bg\.jpg$/i);
    const target = cardForButton(/^bg-2\.jpg$/i);
    mockCardRect(source, 0);
    mockCardRect(target, 108);

    fireEvent(source, pointerEventWithPoint("pointerDown", source, 50, 20));
    fireEvent(source, pointerEventWithPoint("pointerMove", source, 130, 72));

    expect(source).toHaveStyle({ transform: "translate3d(80px, 0px, 0) scale(1.03)" });
    expect(target).toHaveAttribute("data-drag-shifted", "true");
    expect(target).toHaveStyle({ transform: "translate3d(-108px, 0px, 0)" });

    fireEvent(source, pointerEventWithPoint("pointerUp", source, 130, 72));

    await waitFor(() => expect(onReorderMedia).toHaveBeenCalledWith([
      "bg-2.jpg",
      "bg.jpg",
      "clip-a.mp4",
      "clip-b.mp4",
      "clip-long-a.mp4",
      "clip-long-b.mp4",
    ]));
  });

  it("keeps the shifted target in place on drop and commits after the source settles", () => {
    vi.useFakeTimers();
    try {
      const { onReorderMedia } = renderModal();
      const source = cardForButton(/^bg\.jpg$/i);
      const target = cardForButton(/^bg-2\.jpg$/i);
      mockCardRect(source, 0);
      mockCardRect(target, 108);

      fireEvent(source, pointerEventWithPoint("pointerDown", source, 50, 20));
      fireEvent(source, pointerEventWithPoint("pointerMove", source, 130, 72));
      fireEvent(source, pointerEventWithPoint("pointerUp", source, 130, 72));

      expect(onReorderMedia).not.toHaveBeenCalled();
      expect(target).toHaveAttribute("data-drag-shifted", "true");
      expect(target).toHaveStyle({ transform: "translate3d(-108px, 0px, 0)" });
      expect(source).toHaveAttribute("data-drag-drop-settling", "true");
      expect(source).toHaveStyle({ transform: "translate3d(108px, 0px, 0) scale(1)" });

      act(() => {
        vi.advanceTimersByTime(190);
      });

      expect(onReorderMedia).toHaveBeenCalledWith([
        "bg-2.jpg",
        "bg.jpg",
        "clip-a.mp4",
        "clip-b.mp4",
        "clip-long-a.mp4",
        "clip-long-b.mp4",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the background timeline item constant for long video playlists", () => {
    const { onSave } = renderModal({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: /clip-long-a\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: /clip-long-b\.mp4/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0]).toMatchObject({
      mediaIds: ["clip-long-a.mp4", "clip-long-b.mp4"],
      start: 0,
      end: 10,
    });
  });

  it("preserves existing cache status for unchanged edited background playlist", () => {
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [
          {
            id: "bg-playlist",
            mediaIds: ["bg.jpg", "bg-2.jpg"],
            sentences: [1, 6],
            end: 10,
            start: 0,
            motion: { kind: "ken_burns", easing: "linear" },
            transitions: { in: "cut", out: "cut" },
            crossfade: 0,
            cache_status: "warm",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const layer = onSave.mock.calls[0][0];
    expect(layer.items[0]).toMatchObject({ id: "bg-playlist", cache_status: "warm" });
  });

  it("invalidates edited background playlist when playlist properties change", () => {
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [
          {
            id: "bg-playlist",
            mediaIds: ["bg.jpg", "bg-2.jpg"],
            sentences: [1, 6],
            start: 0,
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
    expect(layer.items[0]).toMatchObject({ id: "bg-playlist", cache_status: "invalid" });
  });
});
