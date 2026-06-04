import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const CROWDED_MEDIA = [
  ...MEDIA,
  {
    mediaId: "bg-extra-long-name.jpg",
    filename: "a-very-long-background-name-that-must-truncate-in-the-coverage-grid.jpg",
    kind: "image" as const,
    thumb_url: "/thumb/bg-extra-long-name.jpg",
    duration: null,
    importing: false,
    import_error: null,
  },
  {
    mediaId: "clip-extra-long-name.mp4",
    filename: "an-extremely-long-background-video-file-name-that-cannot-overflow-the-row-inputs.mp4",
    kind: "video" as const,
    thumb_url: "",
    duration: 5,
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

function mockRowRect(element: HTMLElement, top: number, height = 80) {
  const rect = {
    bottom: top + height,
    height,
    left: 0,
    right: 500,
    top,
    width: 500,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => rect });
}

function coverageRowIds(): Array<string | null> {
  return screen.getAllByTestId(/background-coverage-row-/).map((row) => row.getAttribute("data-media-id"));
}

function selectedAssetIds(): Array<string | null> {
  return screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.closest("[data-media-id]")?.getAttribute("data-media-id") ?? null);
}

describe("BgModal", () => {
  it("renders create mode and selected metadata", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Add background" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
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
    expect(screen.getByText("2 selected")).toBeInTheDocument();

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
    expect(screen.getByText("1 selected")).toBeInTheDocument();
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
    expect(screen.getByText("2 selected")).toBeInTheDocument();
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

  it("allows mixed image/video selection and saves explicit schedule rows from time strings", () => {
    const { onSave } = renderModal({ duration: 90 });
    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    const videoCard = screen.getByRole("button", { name: /^clip-a\.mp4$/i });
    fireEvent.click(videoCard);
    fireEvent.click(screen.getByRole("button", { name: /^bg-2\.jpg$/i }));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.queryByText(/mixed|images only|clips only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Will replace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/timeline item/i)).not.toBeInTheDocument();
    expect(coverageRowIds()).toEqual(["bg.jpg", "clip-a.mp4", "bg-2.jpg"]);
    expect(screen.getByRole("button", { name: /^clip-a\.mp4 selected$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^bg\.jpg selected$/i })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByLabelText("Start clip-a.mp4")).toBeEnabled();
    expect(screen.getByLabelText("End clip-a.mp4")).toBeDisabled();
    expect(screen.getByLabelText("Hold clip-a.mp4")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("End bg.jpg"), { target: { value: "01:10" } });
    fireEvent.blur(screen.getByLabelText("End bg.jpg"));

    expect(screen.getByLabelText("Start clip-a.mp4")).toHaveValue("01:10");
    expect(screen.getByLabelText("End clip-a.mp4")).toHaveValue("01:14");
    expect(screen.getByLabelText("Start bg-2.jpg")).toHaveValue("01:14");
    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        mediaIds: ["bg.jpg", "clip-a.mp4", "bg-2.jpg"],
        schedule: [
          { id: "seg-bg.jpg", mediaId: "bg.jpg", start: 0, end: 70, lockedDuration: false },
          { id: "seg-clip-a.mp4", mediaId: "clip-a.mp4", start: 70, end: 74, lockedDuration: true },
          { id: "seg-bg-2.jpg", mediaId: "bg-2.jpg", start: 74, end: 90, lockedDuration: false },
        ],
      })],
    }));
  });

  it("allows editing a video start while keeping its end and hold locked to native duration", () => {
    const { onSave } = renderModal({
      duration: 90,
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-scheduled",
          mediaIds: ["clip-a.mp4", "bg.jpg"],
          schedule: [
            { id: "seg-clip-a.mp4", mediaId: "clip-a.mp4", start: 0, end: 4, lockedDuration: true },
            { id: "seg-bg.jpg", mediaId: "bg.jpg", start: 4, end: 90, lockedDuration: false },
          ],
          sentences: [1, 6],
          start: 0,
          end: 90,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
    });

    fireEvent.change(screen.getByLabelText("Start clip-a.mp4"), { target: { value: "00:12" } });
    fireEvent.blur(screen.getByLabelText("Start clip-a.mp4"));

    expect(screen.getByLabelText("Start clip-a.mp4")).toHaveValue("00:12");
    expect(screen.getByLabelText("End clip-a.mp4")).toHaveValue("00:16");
    expect(screen.getByLabelText("Hold clip-a.mp4")).toHaveValue("00:04");
    expect(screen.getByLabelText("End clip-a.mp4")).toBeDisabled();
    expect(screen.getByLabelText("Hold clip-a.mp4")).toBeDisabled();
    expect(screen.getByLabelText("Start bg.jpg")).toHaveValue("00:16");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        mediaIds: ["clip-a.mp4", "bg.jpg"],
        schedule: [
          { id: "seg-clip-a.mp4", mediaId: "clip-a.mp4", start: 12, end: 16, lockedDuration: true },
          { id: "seg-bg.jpg", mediaId: "bg.jpg", start: 16, end: 90, lockedDuration: false },
        ],
      })],
    }));
  });

  it("caps a long video row at the project duration and keeps shorter videos at start plus native duration", () => {
    const longVideoMedia = MEDIA.map((item) => (
      item.mediaId === "clip-a.mp4" ? { ...item, duration: 1222 } : item
    ));
    const { onSave } = renderModal({ duration: 300, media: longVideoMedia });

    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clip-a\.mp4$/i }));

    expect(screen.getByLabelText("Start clip-a.mp4")).toHaveValue("00:30");
    expect(screen.getByLabelText("End clip-a.mp4")).toHaveValue("05:00");
    expect(screen.getByLabelText("Hold clip-a.mp4")).toHaveValue("04:30");
    expect(screen.getByText("native 20:22")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add background" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        mediaIds: ["bg.jpg", "clip-a.mp4"],
        schedule: [
          { id: "seg-bg.jpg", mediaId: "bg.jpg", start: 0, end: 30, lockedDuration: false },
          { id: "seg-clip-a.mp4", mediaId: "clip-a.mp4", start: 30, end: 300, lockedDuration: true },
        ],
      })],
    }));
  });

  it("keeps a coverage row for every selected asset when a locked video consumes the duration", () => {
    const longVideoMedia = MEDIA.map((item) => (
      item.mediaId === "clip-a.mp4" ? { ...item, duration: 20 } : item
    ));
    const { onSave } = renderModal({ duration: 10, media: longVideoMedia });

    fireEvent.click(screen.getByRole("button", { name: /^bg\.jpg$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clip-a\.mp4$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^bg-2\.jpg$/i }));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByTestId("background-coverage-grid")).toHaveAttribute("data-row-count", "3");
    expect(coverageRowIds()).toEqual(["bg.jpg", "clip-a.mp4", "bg-2.jpg"]);
    expect(screen.getByLabelText("Start bg.jpg")).toBeEnabled();
    expect(screen.getByLabelText("Start clip-a.mp4")).toBeEnabled();
    expect(screen.getByLabelText("Start bg-2.jpg")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Add background" }));
    expect(onSave.mock.calls[0][0].items[0].schedule).toHaveLength(3);
  });

  it("renders every uploaded asset in a scrollable asset grid instead of capping at six", () => {
    renderModal({ media: CROWDED_MEDIA });

    const assetGrid = screen.getByTestId("background-asset-grid");

    expect(assetGrid).toHaveAttribute("data-asset-count", String(CROWDED_MEDIA.length));
    expect(assetGrid).toHaveClass("overflow-y-auto");
    for (const item of CROWDED_MEDIA) {
      expect(within(assetGrid).getByRole("button", { name: item.filename })).toBeInTheDocument();
    }
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

  it("drag-sorts coverage plan rows and saves the synchronized asset order", async () => {
    const { onSave } = renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-scheduled",
          mediaIds: ["bg.jpg", "clip-a.mp4", "bg-2.jpg"],
          schedule: [
            { id: "seg-bg", mediaId: "bg.jpg", start: 0, end: 4, lockedDuration: false },
            { id: "seg-clip", mediaId: "clip-a.mp4", start: 4, end: 8, lockedDuration: true },
            { id: "seg-bg-2", mediaId: "bg-2.jpg", start: 8, end: 10, lockedDuration: false },
          ],
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
    });

    const target = screen.getByTestId("background-coverage-row-bg.jpg");
    const middle = screen.getByTestId("background-coverage-row-clip-a.mp4");
    const source = screen.getByTestId("background-coverage-row-bg-2.jpg");
    mockRowRect(target, 0);
    mockRowRect(middle, 88);
    mockRowRect(source, 176);
    const restore = mockElementsFromPoint(target);
    try {
      fireEvent(source, pointerEventWithPoint("pointerDown", source, 20, 200));
      fireEvent(source, pointerEventWithPoint("pointerMove", source, 20, 20));
      fireEvent(source, pointerEventWithPoint("pointerUp", source, 20, 20));
    } finally {
      restore();
    }

    await waitFor(() => expect(coverageRowIds()).toEqual(["bg-2.jpg", "bg.jpg", "clip-a.mp4"]));
    expect(selectedAssetIds()).toEqual(["bg-2.jpg", "bg.jpg", "clip-a.mp4"]);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        mediaIds: ["bg-2.jpg", "bg.jpg", "clip-a.mp4"],
        schedule: [
          expect.objectContaining({ end: 2, mediaId: "bg-2.jpg", start: 0 }),
          expect.objectContaining({ end: 4, mediaId: "bg.jpg", start: 2 }),
          expect.objectContaining({ end: 8, mediaId: "clip-a.mp4", start: 4 }),
        ],
      })],
    }));
  });

  it("keeps crowded coverage rows overflow-safe and truncates long names", () => {
    renderModal({
      duration: 120,
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-crowded",
          mediaIds: CROWDED_MEDIA.map((item) => item.mediaId),
          sentences: [1, 6],
          start: 0,
          end: 120,
          motion: { kind: "none", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
      media: CROWDED_MEDIA,
    });

    const grid = screen.getByTestId("background-coverage-grid");
    expect(grid).toHaveAttribute("data-row-count", String(CROWDED_MEDIA.length));
    expect(screen.getByTestId("background-coverage-name-bg-extra-long-name.jpg")).toHaveClass("truncate");
    expect(screen.getByTestId("background-coverage-name-bg-extra-long-name.jpg")).toHaveAttribute(
      "title",
      "a-very-long-background-name-that-must-truncate-in-the-coverage-grid.jpg",
    );
    for (const input of within(grid).getAllByRole("textbox")) {
      expect(input).toHaveClass("min-w-0");
    }
  });

  it("keeps left asset cards static while coverage rows retain drag motion", () => {
    renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-scheduled",
          mediaIds: ["bg.jpg", "clip-a.mp4", "bg-2.jpg"],
          schedule: [
            { id: "seg-bg", mediaId: "bg.jpg", start: 0, end: 4, lockedDuration: false },
            { id: "seg-clip", mediaId: "clip-a.mp4", start: 4, end: 8, lockedDuration: true },
            { id: "seg-bg-2", mediaId: "bg-2.jpg", start: 8, end: 10, lockedDuration: false },
          ],
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
    });

    const assetCard = screen.getByRole("button", { name: /^bg\.jpg selected$/i }).closest("[data-media-id='bg.jpg']");
    const coverageRow = screen.getByTestId("background-coverage-row-bg.jpg");

    expect(assetCard).not.toHaveClass("will-change-transform");
    expect(assetCard).not.toHaveClass("cursor-grab");
    expect(coverageRow).toHaveClass("will-change-transform", "cursor-grab");
  });

  it("animates the active coverage row while it is being dragged", () => {
    renderModal({
      existing: {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-scheduled",
          mediaIds: ["bg.jpg", "clip-a.mp4", "bg-2.jpg"],
          schedule: [
            { id: "seg-bg", mediaId: "bg.jpg", start: 0, end: 4, lockedDuration: false },
            { id: "seg-clip", mediaId: "clip-a.mp4", start: 4, end: 8, lockedDuration: true },
            { id: "seg-bg-2", mediaId: "bg-2.jpg", start: 8, end: 10, lockedDuration: false },
          ],
          sentences: [1, 6],
          start: 0,
          end: 10,
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      },
    });

    const row = screen.getByTestId("background-coverage-row-bg.jpg");
    const setPointerCapture = vi.fn();
    Object.defineProperty(row, "setPointerCapture", { configurable: true, value: setPointerCapture });

    fireEvent(row, pointerEventWithPoint("pointerDown", row, 20, 20));
    fireEvent(row, pointerEventWithPoint("pointerMove", row, 20, 42));

    expect(row).toHaveAttribute("data-drag-active", "true");
    expect(row).toHaveStyle({ transform: "translate3d(0px, 22px, 0) scale(1.03)" });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
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
