import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { EditorModal } from "./EditorModal";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const MEDIA = [
  {
    mediaId: "bg.jpg",
    filename: "bg.jpg",
    kind: "image" as const,
    path: "uploads/bg.jpg",
    thumb_path: "uploads/.thumbs/bg.jpg",
    thumb_url: "/uploads/thumb?filename=bg.jpg",
    width: 1920,
    height: 1080,
    duration: null,
    size: 1024,
    hash: null,
    import_mode: "copy" as const,
    imported_at: "2026-05-16T00:00:00Z",
    created_at: null,
  },
];

const DEFAULT_SUBTITLES = {
  burn_in: false,
  style: {
    font: "Arial",
    size: 28,
    position: "bottom" as const,
    max_chars_per_line: 42,
    bg_style: "shadow" as const,
  },
};

function renderModal(overrides: Partial<Parameters<typeof EditorModal>[0]> = {}) {
  const onImport = vi.fn().mockResolvedValue(undefined);
  const onApplySubtitles = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditorModal
        assignRange={[1, 2]}
        media={MEDIA}
        modal="upload"
        onClose={vi.fn()}
        onApplySubtitles={onApplySubtitles}
        onImport={onImport}
        previewResolution="1080p"
        projectPath="E:/projects/test01"
        subtitles={DEFAULT_SUBTITLES}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onApplySubtitles, onImport };
}

describe("EditorModal", () => {
  it("renders media metadata and uses thumbnail URL", () => {
    renderModal();

    expect(screen.getByText("bg.jpg")).toBeInTheDocument();
    expect(screen.getByText(/IMG ·/i)).toBeInTheDocument();
    const preview = screen.getByRole("img", { name: "bg.jpg" });
    expect(preview).toHaveAttribute("src", "/api/server/uploads/thumb?filename=bg.jpg");
  });

  it("forwards selected files to onImport", async () => {
    const { onImport } = renderModal();
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(onImport).toHaveBeenCalledTimes(1);
    const firstArg = onImport.mock.calls[0]?.[0] as FileList | null;
    expect(firstArg?.[0]?.name).toBe("clip.mp4");
  });

  it("applies subtitles settings from modal controls", () => {
    const { onApplySubtitles } = renderModal({
      modal: "subtitles",
      subtitles: DEFAULT_SUBTITLES,
    });

    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "pill" } });
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "top" } });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "Helvetica Neue" } });
    fireEvent.change(screen.getByLabelText("Max chars / line"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("switch", { name: "Burn-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplySubtitles).toHaveBeenCalledWith({
      burn_in: true,
      style: {
        bg_style: "pill",
        font: "Helvetica Neue",
        max_chars_per_line: 32,
        position: "top",
        size: 40,
      },
    });
  });

  it("cancels subtitles changes without applying", () => {
    const { onApplySubtitles } = renderModal({
      modal: "subtitles",
      subtitles: DEFAULT_SUBTITLES,
    });

    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "SF Pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onApplySubtitles).not.toHaveBeenCalled();
  });

  it("uses current preview resolution for subtitles live preview", () => {
    renderModal({
      modal: "subtitles",
      previewResolution: "9:16",
      subtitles: DEFAULT_SUBTITLES,
    });

    const preview = screen.getByTestId("subtitles-live-preview");
    expect(preview.className).toContain("aspect-[9/16]");
    expect(preview.className).not.toContain("aspect-video");
  });
});
