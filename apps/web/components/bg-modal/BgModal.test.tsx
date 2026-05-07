import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { BgModal } from "./BgModal";

const MEDIA = [
  { filename: "bg.jpg", size: 100, kind: "image" as const, thumb_url: "/thumb/bg.jpg" },
  { filename: "clip.mp4", size: 200, kind: "video" as const, thumb_url: "" },
];

it("renders trigger child", () => {
  render(
    <BgModal duration={10} media={MEDIA} onSave={vi.fn()} totalSentences={3}>
      <button>Open</button>
    </BgModal>,
  );
  expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
});

it("opens dialog on trigger click", async () => {
  render(
    <BgModal duration={10} media={MEDIA} onSave={vi.fn()} totalSentences={3}>
      <button>Open</button>
    </BgModal>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
});

it("shows media items in picker", async () => {
  render(
    <BgModal duration={10} media={MEDIA} onSave={vi.fn()} totalSentences={3}>
      <button>Open</button>
    </BgModal>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => {
    // bg.jpg has a thumb_url so renders as <img alt="bg.jpg">
    expect(screen.getByAltText("bg.jpg")).toBeInTheDocument();
    // clip.mp4 has no thumb_url so renders a video icon
    expect(screen.getByText("▶")).toBeInTheDocument();
  });
});

it("calls onSave when Save is clicked after selecting media", async () => {
  const onSave = vi.fn();
  render(
    <BgModal duration={10} media={MEDIA} onSave={onSave} totalSentences={3}>
      <button>Open</button>
    </BgModal>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => screen.getByRole("dialog"));

  // Select bg.jpg (rendered as <img alt="bg.jpg"> inside a picker button)
  fireEvent.click(screen.getByAltText("bg.jpg").closest("button")!);

  fireEvent.click(screen.getByRole("button", { name: /set background/i }));
  expect(onSave).toHaveBeenCalled();
});
