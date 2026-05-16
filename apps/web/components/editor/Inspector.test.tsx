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
  const onOpenAssignEdit = vi.fn();
  const onOpenBackground = vi.fn();
  const onOpenUpload = vi.fn();

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Inspector
        layers={LAYERS}
        media={MEDIA}
        onOpenAssignEdit={onOpenAssignEdit}
        onOpenBackground={onOpenBackground}
        onOpenUpload={onOpenUpload}
        projectPath="E:/projects/test01"
        selected={{ layerId: "fg-z1", itemId: "fg-1" }}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );

  return { onOpenAssignEdit, onOpenBackground, onOpenUpload };
}

describe("Inspector", () => {
  it("opens assign edit for non-background asset card", () => {
    const { onOpenAssignEdit } = renderInspector();
    fireEvent.click(screen.getByRole("button", { name: /clip\.mp4/i }));
    expect(onOpenAssignEdit).toHaveBeenCalledWith("fg-z1", "fg-1", [2, 3]);
  });

  it("opens background modal for background asset card", () => {
    const { onOpenBackground, onOpenAssignEdit } = renderInspector({
      selected: { layerId: "bg-main", itemId: "bg-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /bg0\.png/i }));
    expect(onOpenBackground).toHaveBeenCalledTimes(1);
    expect(onOpenAssignEdit).not.toHaveBeenCalled();
  });
});

