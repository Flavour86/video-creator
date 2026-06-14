import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { EditorModal } from "./EditorModal";

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
    color: "#ffffff",
    bg_color: "#000000",
    bg_opacity: 62,
    bg_radius: 8,
  },
};

const SUBTITLE_PREVIEW_CASES: Array<[
  Parameters<typeof EditorModal>[0]["previewResolution"],
  number,
  number,
  number,
]> = [
  ["1080p", 1920, 1080, 720],
  ["720p", 1280, 720, 720],
  ["9:16", 1080, 1920, 292.5],
];

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

    fireEvent.change(screen.getByLabelText("Background"), { target: { value: "block" } });
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "top" } });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "Helvetica Neue" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ffcc00" } });
    fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#112233" } });
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Max characters per line"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("switch", { name: "Show subtitles" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplySubtitles).toHaveBeenCalledWith({
      burn_in: true,
      style: {
        bg_style: "block",
        bg_color: "#112233",
        bg_opacity: 45,
        bg_radius: 14,
        color: "#ffcc00",
        font: "Helvetica Neue",
        max_chars_per_line: 20,
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

  it("loads max characters per line with the subtitle controls", () => {
    renderModal({
      modal: "subtitles",
      subtitles: {
        ...DEFAULT_SUBTITLES,
        style: {
          ...DEFAULT_SUBTITLES.style,
          max_chars_per_line: 64,
        },
      },
    });

    expect(screen.getByLabelText("Max characters per line")).toHaveValue("64");
    expect(screen.getByLabelText("Color")).toBeInTheDocument();
    expect(screen.getByLabelText("Background color")).toBeInTheDocument();
    expect(screen.getByLabelText("Opacity")).toBeInTheDocument();
    expect(screen.getByLabelText("Radius")).toBeInTheDocument();
  });

  it("clamps max characters per line and updates the live preview wrapping", () => {
    renderModal({
      modal: "subtitles",
      subtitles: {
        ...DEFAULT_SUBTITLES,
        burn_in: true,
      },
    });

    const maxChars = screen.getByLabelText("Max characters per line");
    const cue = screen.getByTestId("subtitles-preview-cue");
    expect(maxChars).toHaveValue("42");
    expect(cue.firstElementChild).toHaveTextContent("This subtitle preview follows your style");

    fireEvent.change(maxChars, { target: { value: "10" } });

    expect(maxChars).toHaveValue("10");
    expect(cue.firstElementChild).toHaveTextContent("This subtitle preview follows your style");

    fireEvent.blur(maxChars);

    expect(maxChars).toHaveValue("20");
    expect(cue.firstElementChild).toHaveTextContent("This subtitle");

    fireEvent.change(maxChars, { target: { value: "100" } });

    expect(maxChars).toHaveValue("100");

    fireEvent.blur(maxChars);

    expect(maxChars).toHaveValue("80");
    expect(cue.firstElementChild).toHaveTextContent("This subtitle preview follows your style and stays inside the safe zone.");
  });

  it("allows direct manual typing for max characters per line", () => {
    const { onApplySubtitles } = renderModal({
      modal: "subtitles",
      subtitles: {
        ...DEFAULT_SUBTITLES,
        burn_in: true,
      },
    });

    const maxChars = screen.getByLabelText("Max characters per line");
    expect(maxChars).toHaveAttribute("type", "text");
    fireEvent.change(maxChars, { target: { value: "6" } });
    expect(maxChars).toHaveValue("6");

    fireEvent.change(maxChars, { target: { value: "65" } });
    expect(maxChars).toHaveValue("65");

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApplySubtitles).toHaveBeenCalledWith({
      burn_in: true,
      style: {
        ...DEFAULT_SUBTITLES.style,
        max_chars_per_line: 65,
      },
    });
  });

  it("keeps a max-70 subtitle preview to two balanced lines", () => {
    renderModal({
      modal: "subtitles",
      subtitles: {
        ...DEFAULT_SUBTITLES,
        burn_in: true,
        style: {
          ...DEFAULT_SUBTITLES.style,
          max_chars_per_line: 70,
        },
      },
    });

    const cue = screen.getByTestId("subtitles-preview-cue");
    expect(Array.from(cue.children).map((child) => child.textContent)).toEqual([
      "This subtitle preview follows your style and stays inside the",
      "safe zone.",
    ]);
  });

  it("disables background rectangle controls by mode", () => {
    renderModal({
      modal: "subtitles",
      subtitles: DEFAULT_SUBTITLES,
    });

    const background = screen.getByLabelText("Background");
    const backgroundColor = screen.getByLabelText("Background color");
    const opacity = screen.getByLabelText("Opacity");
    const radius = screen.getByLabelText("Radius");

    expect(backgroundColor).toBeDisabled();
    expect(opacity).toBeDisabled();
    expect(radius).toBeDisabled();

    fireEvent.change(background, { target: { value: "none" } });
    expect(backgroundColor).toBeDisabled();
    expect(opacity).toBeDisabled();
    expect(radius).toBeDisabled();

    fireEvent.change(background, { target: { value: "pill" } });
    expect(backgroundColor).toBeEnabled();
    expect(opacity).toBeEnabled();
    expect(radius).toBeDisabled();

    fireEvent.change(background, { target: { value: "block" } });
    expect(backgroundColor).toBeEnabled();
    expect(opacity).toBeEnabled();
    expect(radius).toBeEnabled();
  });

  it("updates subtitle live preview from color and background controls", () => {
    renderModal({
      modal: "subtitles",
      subtitles: {
        ...DEFAULT_SUBTITLES,
        burn_in: true,
        style: { ...DEFAULT_SUBTITLES.style, bg_style: "block" },
      },
    });

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ffcc00" } });
    fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#112233" } });
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "14" } });

    const cue = screen.getByTestId("subtitles-preview-cue");
    expect(cue).toHaveStyle({ color: "#ffcc00" });
    expect(cue).toHaveStyle({ backgroundColor: "rgba(17, 34, 51, 0.45)" });
    expect(Number.parseFloat(cue.style.borderRadius)).toBeCloseTo(14 * (720 / 1920), 2);
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
    expect(preview).toHaveStyle({ width: "min(100%, calc(min(58vh, 520px) * 9 / 16))" });
    fireEvent.click(screen.getByRole("switch", { name: "Show subtitles" }));
    expect(screen.getByText(/subtitle preview follows your style/i)).toBeInTheDocument();
    expect(screen.queryByText(/drop an image onto a sentence/i)).not.toBeInTheDocument();
  });

  it.each(SUBTITLE_PREVIEW_CASES)(
    "scales subtitle preview text from render pixels for %s",
    (previewResolution, renderWidth, renderHeight, frameWidth) => {
      const subtitleSize = 56;
      renderModal({
        modal: "subtitles",
        previewResolution,
        subtitles: {
          burn_in: true,
          style: {
            ...DEFAULT_SUBTITLES.style,
            size: subtitleSize,
          },
        },
      });

      const preview = screen.getByTestId("subtitles-live-preview");
      const cue = screen.getByTestId("subtitles-preview-cue");
      const scale = frameWidth / renderWidth;

      expect(preview).toHaveAttribute("data-render-width", String(renderWidth));
      expect(preview).toHaveAttribute("data-render-height", String(renderHeight));
      expect(Number.parseFloat(preview.dataset.previewWidth ?? "")).toBeCloseTo(frameWidth, 2);
      expect(Number.parseFloat(preview.dataset.previewScale ?? "")).toBeCloseTo(scale, 4);
      expect(Number.parseFloat(cue.style.fontSize)).toBeCloseTo(subtitleSize * scale, 2);
      expect(Number.parseFloat(cue.style.bottom)).toBeCloseTo(60 * scale, 2);
      expect(Number.parseFloat(cue.style.maxWidth.match(/- ([\d.]+)px/)?.[1] ?? "")).toBeCloseTo(frameWidth * 0.16, 2);
    },
  );

  it("scales subtitle top and low-bottom safe-zone margins in the live preview", () => {
    const scale = 720 / 1920;
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorModal
          assignRange={[1, 2]}
          media={MEDIA}
          modal="subtitles"
          onClose={vi.fn()}
          onApplySubtitles={vi.fn()}
          onImport={vi.fn()}
          previewResolution="1080p"
          projectPath="E:/projects/test01"
          subtitles={{
            burn_in: true,
            style: {
              ...DEFAULT_SUBTITLES.style,
              position: "top",
            },
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(Number.parseFloat(screen.getByTestId("subtitles-preview-cue").style.top)).toBeCloseTo(40 * scale, 2);

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorModal
          assignRange={[1, 2]}
          media={MEDIA}
          modal="subtitles"
          onClose={vi.fn()}
          onApplySubtitles={vi.fn()}
          onImport={vi.fn()}
          previewResolution="1080p"
          projectPath="E:/projects/test01"
          subtitles={{
            burn_in: true,
            style: {
              ...DEFAULT_SUBTITLES.style,
              position: "bottom_low",
            },
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(Number.parseFloat(screen.getByTestId("subtitles-preview-cue").style.bottom)).toBeCloseTo(24 * scale, 2);
  });

  it("uses the compact amber editor dialog treatment for subtitle controls", () => {
    renderModal({ modal: "subtitles", subtitles: DEFAULT_SUBTITLES });

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-[min(760px");
    expect(screen.getByTestId("subtitles-live-preview")).toHaveStyle({ width: "100%" });
    fireEvent.click(screen.getByRole("switch", { name: "Show subtitles" }));
    expect(screen.getByRole("switch", { name: "Show subtitles" }).className).toContain("bg-(--amber)");
    expect(screen.getByRole("button", { name: "Apply" }).className).toContain("bg-(--amber)");
  });
});
