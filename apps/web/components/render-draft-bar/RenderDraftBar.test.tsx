import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { RenderDraftBar } from "./RenderDraftBar";

it("renders running progress and cancel action", () => {
  const onCancel = vi.fn();
  render(
    <RenderDraftBar
      onCancel={onCancel}
      projectPath="E:/project"
      state={{
        status: "running",
        renderId: "r-1",
        outputPath: "draft.mp4",
        stage: "compose",
        percent: 42,
        message: "ffmpeg compose",
      }}
    />,
  );

  expect(screen.getByText("ffmpeg compose")).toBeInTheDocument();
  expect(screen.getByText("42%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("renders open link when draft is done", () => {
  render(
    <RenderDraftBar
      onCancel={vi.fn()}
      projectPath="E:/project"
      state={{
        status: "done",
        renderId: "r-1",
        outputPath: "draft.mp4",
        percent: 100,
        message: "Draft ready",
      }}
    />,
  );

  const link = screen.getByRole("link", { name: /open/i });
  expect(link).toHaveAttribute("href", "/render?project=E%3A%2Fproject&renderId=r-1");
});
