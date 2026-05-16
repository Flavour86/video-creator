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

function renderModal(overrides: Partial<Parameters<typeof EditorModal>[0]> = {}) {
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditorModal
        assignRange={[1, 2]}
        media={MEDIA}
        modal="upload"
        onClose={vi.fn()}
        onImport={onImport}
        projectPath="E:/projects/test01"
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onImport };
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
});
