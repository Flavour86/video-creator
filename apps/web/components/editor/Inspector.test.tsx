import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { Inspector } from "./Inspector";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const MEDIA = [
  {
    mediaId: "bg0.png",
    filename: "bg0.png",
    kind: "image" as const,
    path: "uploads/bg0.png",
    thumb_path: "uploads/.thumbs/bg0.jpg",
    thumb_url: "/uploads/thumb?filename=bg0.jpg",
    width: 1920,
    height: 1080,
    duration: null,
    size: 1024,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-16T00:00:00Z",
    created_at: null,
  },
  {
    mediaId: "bg1.png",
    filename: "bg1.png",
    kind: "image" as const,
    path: "uploads/bg1.png",
    thumb_path: "uploads/.thumbs/bg1.jpg",
    thumb_url: "/uploads/thumb?filename=bg1.jpg",
    width: 1920,
    height: 1080,
    duration: null,
    size: 2048,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-16T00:00:01Z",
    created_at: null,
  },
  {
    mediaId: "clip.mp4",
    filename: "clip.mp4",
    kind: "video" as const,
    path: "uploads/clip.mp4",
    thumb_path: "uploads/.thumbs/clip.jpg",
    thumb_url: "/uploads/thumb?filename=clip.jpg",
    width: 1280,
    height: 720,
    duration: 4,
    size: 2048,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-16T00:00:01Z",
    created_at: null,
  },
];

const LAYERS: Layer[] = [
  {
    id: "bg-main",
    kind: "bg",
    name: "Background",
    items: [
      {
        id: "bg-1",
        mediaId: "bg0.png",
        sentences: [1, 3],
        start: 0,
        end: 9,
        motion: { kind: "ken_burns", easing: "ease_in_out" },
        transitions: { in: "cut", out: "cut" },
        crossfade: 0.4,
      },
    ],
  },
  {
    id: "fg-z1",
    kind: "fg",
    name: "Foreground z1",
    items: [
      {
        id: "fg-1",
        mediaId: "clip.mp4",
        sentences: [2, 3],
        start: 3,
        end: 9,
        motion: { kind: "none", easing: "ease_in_out" },
        transitions: { in: "fade", out: "cut" },
      },
    ],
  },
];

function renderInspector(overrides: Partial<Parameters<typeof Inspector>[0]> = {}) {
  const onDeleteItem = vi.fn();
  const onOpenAssignEdit = vi.fn();
  const onOpenBackground = vi.fn();
  const onOpenSubtitles = vi.fn();
  const onOpenWatermark = vi.fn();
  const onPatchBackground = vi.fn();
  const onPatchItem = vi.fn();
  const onRemoveBackground = vi.fn();
  const onReplaceItemMedia = vi.fn();
  const onUpdateRange = vi.fn();

  const rendered = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Inspector
        layers={LAYERS}
        media={MEDIA}
        onDeleteItem={onDeleteItem}
        onOpenAssignEdit={onOpenAssignEdit}
        onOpenBackground={onOpenBackground}
        onOpenSubtitles={onOpenSubtitles}
        onOpenWatermark={onOpenWatermark}
        onPatchBackground={onPatchBackground}
        onPatchItem={onPatchItem}
        onRemoveBackground={onRemoveBackground}
        onReplaceItemMedia={onReplaceItemMedia}
        onUpdateRange={onUpdateRange}
        projectPath="E:/projects/test01"
        selected={{ layerId: "fg-z1", itemId: "fg-1" }}
        subtitles={null}
        watermark={null}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );

  return {
    ...rendered,
    onDeleteItem,
    onOpenAssignEdit,
    onOpenBackground,
    onOpenSubtitles,
    onOpenWatermark,
    onPatchBackground,
    onPatchItem,
    onRemoveBackground,
    onReplaceItemMedia,
    onUpdateRange,
  };
}

describe("Inspector", () => {
  it("shows global Change Background when background layer exists", () => {
    renderInspector();
    expect(screen.getByRole("button", { name: /Change Background/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Background" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change Background/i })).not.toHaveTextContent("bg0.png");
    expect(screen.getByRole("button", { name: /Change Background/i })).toHaveTextContent("Change Background");
  });

  it("shows only left-aligned global config action labels", () => {
    renderInspector();

    expect(screen.getByRole("button", { name: "Watermark" })).toHaveTextContent(/^Watermark$/);
    expect(screen.getByRole("button", { name: "Subtitles" })).toHaveTextContent(/^Subtitles$/);
    expect(screen.getByRole("button", { name: "Change Background" })).toHaveTextContent(/^Change Background$/);
    expect(screen.queryByText("Choose")).not.toBeInTheDocument();
    expect(screen.queryByText("Visible")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("uses uploaded video thumbnails in the background asset list", () => {
    const { container } = renderInspector({
      layers: [{
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-video",
          mediaId: "clip.mp4",
          sentences: [1, 3],
          start: 0,
          end: 9,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0,
        }],
      }],
      selected: { layerId: "bg-main", itemId: "bg-video" },
    });

    expect(screen.queryByText("missing asset")).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/api/server/uploads/thumb?filename=clip.jpg"]')).not.toBeNull();
  });

  it("keeps all global config actions neutral until hover", () => {
    renderInspector();

    for (const button of [
      screen.getByRole("button", { name: "Watermark" }),
      screen.getByRole("button", { name: "Subtitles" }),
      screen.getByRole("button", { name: /Change Background/i }),
    ]) {
      expect(button.className).not.toContain("bg-(--amber)/10");
      expect(button.className).not.toContain("border-(--amber)/35");
      expect(button.className).toContain("hover:border-(--amber)");
    }
  });

  it("shows global Add Background when background layer is absent", () => {
    renderInspector({
      layers: LAYERS.filter((layer) => layer.kind !== "bg"),
      selected: { layerId: "fg-z1", itemId: "fg-1" },
    });
    expect(screen.getByRole("button", { name: /Add Background/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Background" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Background/i })).toHaveTextContent(/^Add Background$/);
  });

  it("renders as an independently scrollable inspector rail", () => {
    const { container } = renderInspector();
    const inspector = container.querySelector("[data-testid='editor-inspector']");
    expect(inspector?.className).toContain("min-h-0");
    expect(inspector?.className).toContain("overflow-y-auto");
  });

  it("uses canonical PiP placement anchors instead of carrying a previous edge margin", () => {
    const { onPatchItem } = renderInspector({
      layers: [
        ...LAYERS,
        {
          id: "pip-z1",
          kind: "pip",
          name: "PiP z1",
          items: [
            {
              id: "pip-1",
              mediaId: "clip.mp4",
              sentences: [1, 2],
              start: 0,
              end: 6,
              motion: { kind: "none", easing: "ease_in_out" },
              transitions: { in: "fade", out: "fade" },
              pip: { opacity: 96, posX: 82, posY: 72, radius: 13, size: 32 },
            },
          ],
        },
      ],
      selected: { layerId: "pip-z1", itemId: "pip-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "PiP placement TL" }));

    expect(onPatchItem).toHaveBeenCalledWith("pip-z1", "pip-1", { pip: { posX: 4, posY: 4 } });
  });

  it("shows editable POSX and POSY controls for PiP placement", () => {
    const { onPatchItem } = renderInspector({
      layers: [
        ...LAYERS,
        {
          id: "pip-z1",
          kind: "pip",
          name: "PiP z1",
          items: [
            {
              id: "pip-1",
              mediaId: "clip.mp4",
              sentences: [1, 2],
              start: 0,
              end: 6,
              motion: { kind: "none", easing: "ease_in_out" },
              transitions: { in: "fade", out: "fade" },
              pip: { opacity: 96, posX: 82, posY: 72, radius: 13, size: 32 },
            },
          ],
        },
      ],
      selected: { layerId: "pip-z1", itemId: "pip-1" },
    });

    expect(screen.getByLabelText("PiP POSX")).toHaveValue(82);
    expect(screen.getByLabelText("PiP POSY")).toHaveValue(72);
    const coordinates = screen.getByTestId("pip-position-coordinates");
    expect(coordinates).toHaveClass("grid-cols-2");
    expect(coordinates).toContainElement(screen.getByLabelText("PiP POSX"));
    expect(coordinates).toContainElement(screen.getByLabelText("PiP POSY"));
    expect(screen.getByLabelText("PiP POSX").closest("label")).toHaveClass("flex", "items-center");
    expect(screen.getByLabelText("PiP POSY").closest("label")).toHaveClass("flex", "items-center");

    fireEvent.change(screen.getByLabelText("PiP POSX"), { target: { value: "96" } });
    fireEvent.change(screen.getByLabelText("PiP POSY"), { target: { value: "4" } });

    expect(onPatchItem).toHaveBeenCalledWith("pip-z1", "pip-1", { pip: { posX: 96 } });
    expect(onPatchItem).toHaveBeenCalledWith("pip-z1", "pip-1", { pip: { posY: 4 } });
  });

  it("opens background modal from global config control", () => {
    const { onOpenBackground } = renderInspector();
    fireEvent.click(screen.getByRole("button", { name: /Change Background/i }));
    expect(onOpenBackground).toHaveBeenCalledTimes(1);
  });

  it("opens watermark dialog from global config control and omits sqlite badge", () => {
    const { onOpenWatermark } = renderInspector();
    fireEvent.click(screen.getByRole("button", { name: "Watermark" }));
    expect(onOpenWatermark).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("SQLite")).not.toBeInTheDocument();
  });

  it("uses a native file input to replace non-background inspector media", () => {
    const { onOpenAssignEdit, onReplaceItemMedia } = renderInspector();
    fireEvent.click(screen.getByRole("button", { name: /clip\.mp4/i }));
    expect(onOpenAssignEdit).not.toHaveBeenCalled();

    const file = new File([new Uint8Array([1])], "replacement.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Replace foreground media"), {
      target: { files: [file] },
    });
    expect(onReplaceItemMedia).toHaveBeenCalledWith("fg-z1", "fg-1", expect.anything());
  });

  it("uses a native file input to replace background inspector media", () => {
    const { onOpenBackground, onOpenAssignEdit, onReplaceItemMedia } = renderInspector({
      selected: { layerId: "bg-main", itemId: "bg-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change bg0.png" }));
    expect(onOpenBackground).not.toHaveBeenCalled();
    expect(onOpenAssignEdit).not.toHaveBeenCalled();

    const file = new File([new Uint8Array([1])], "replacement-bg.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Replace background asset bg0.png"), {
      target: { files: [file] },
    });
    expect(onReplaceItemMedia).toHaveBeenCalledWith("bg-main", "bg-1", expect.anything(), 0);
  });

  it("renders the selected background playlist as one inspector asset list", () => {
    const { onReplaceItemMedia } = renderInspector({
      layers: [
        {
          id: "bg-main",
          kind: "bg",
          name: "Background",
          items: [
            {
              id: "bg-playlist",
              mediaIds: ["bg0.png", "bg1.png"],
              sentences: [1, 3],
              start: 0,
              end: 9,
              motion: { kind: "ken_burns", easing: "ease_in_out" },
              transitions: { in: "cut", out: "cut" },
              crossfade: 0.4,
            },
          ],
        },
      ],
      selected: { layerId: "bg-main", itemId: "bg-playlist" },
    });

    expect(screen.queryByRole("heading", { name: /background cycle/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Background" })).toBeInTheDocument();
    expect(screen.getByText("bg0.png")).toBeInTheDocument();
    expect(screen.getByText("bg1.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bg0\.png \+1.*change/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change bg0.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change bg1.png" })).toBeInTheDocument();
    expect(screen.queryByText("IMG")).not.toBeInTheDocument();
    expect(screen.queryByText(/images in playlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plays underneath/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change bg1.png" }));
    const file = new File([new Uint8Array([1])], "replacement-second-bg.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Replace background asset bg1.png"), {
      target: { files: [file] },
    });
    expect(onReplaceItemMedia).toHaveBeenCalledWith("bg-main", "bg-playlist", expect.anything(), 1);
  });

  it("shows scheduled background coverage rows with native video duration", () => {
    renderInspector({
      layers: [
        {
          id: "bg-main",
          kind: "bg",
          name: "Background",
          items: [
            {
              id: "bg-scheduled",
              mediaIds: ["bg0.png", "clip.mp4", "bg1.png"],
              schedule: [
                { id: "seg-bg0", mediaId: "bg0.png", start: 0, end: 6, lockedDuration: false },
                { id: "seg-clip", mediaId: "clip.mp4", start: 6, end: 10, lockedDuration: true },
                { id: "seg-bg1", mediaId: "bg1.png", start: 10, end: 25, lockedDuration: false },
              ],
              sentences: [1, 3],
              start: 0,
              end: 25,
              motion: { kind: "ken_burns", easing: "ease_in_out" },
              transitions: { in: "cut", out: "cut" },
              crossfade: 0.4,
            },
          ],
        },
      ],
      selected: { layerId: "bg-main", itemId: "bg-scheduled" },
    });

    expect(screen.getByRole("heading", { name: "Coverage schedule" })).toBeInTheDocument();
    expect(screen.getByTestId("editor-background-schedule-row-bg0.png")).toHaveTextContent("00:00-00:06");
    expect(screen.getByTestId("editor-background-schedule-row-bg0.png")).toHaveTextContent("Image range");
    expect(screen.getByTestId("editor-background-schedule-row-clip.mp4")).toHaveTextContent("Video 00:04 locked");
    expect(screen.getByTestId("editor-background-schedule-row-bg1.png")).toHaveTextContent("00:10-00:25");
  });

  it("removes background from inspector action", () => {
    const { onRemoveBackground } = renderInspector({
      selected: { layerId: "bg-main", itemId: "bg-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /remove background/i }));
    expect(onRemoveBackground).toHaveBeenCalledWith("bg-main");
  });

  it("normalizes background subtle motion alias before patching", () => {
    const { onPatchBackground } = renderInspector({
      selected: { layerId: "bg-main", itemId: "bg-1" },
    });
    fireEvent.change(screen.getByLabelText("Background motion"), { target: { value: "ken_burns_subtle" } });
    expect(onPatchBackground).toHaveBeenCalledWith("bg-main", { motion: { kind: "ken_burns" } });
  });

  it("shows separate motion, easing, and transitions sections for foreground clips", () => {
    const { onPatchItem } = renderInspector();
    expect(screen.queryByText(/Motion & transitions/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Motion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Easing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transitions" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Easing"), { target: { value: "ease_out" } });
    expect(onPatchItem).toHaveBeenCalledWith("fg-z1", "fg-1", { motion: { easing: "ease_out" } });
  });
});
