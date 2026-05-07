import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TimelineRuler } from "./TimelineRuler";

it("renders empty placeholder when duration is zero", () => {
  const { container } = render(
    <TimelineRuler currentTime={0} duration={0} onSeek={vi.fn()} />,
  );
  expect(container.firstChild).toBeInTheDocument();
});

it("renders tick labels for 30s duration at 5s intervals", () => {
  render(<TimelineRuler currentTime={0} duration={30} onSeek={vi.fn()} />);
  expect(screen.getByText("0:00")).toBeInTheDocument();
  expect(screen.getByText("0:05")).toBeInTheDocument();
  expect(screen.getByText("0:10")).toBeInTheDocument();
});

it("renders tick labels for 120s duration at 10s intervals", () => {
  render(<TimelineRuler currentTime={0} duration={120} onSeek={vi.fn()} />);
  expect(screen.getByText("0:00")).toBeInTheDocument();
  expect(screen.getByText("0:10")).toBeInTheDocument();
  expect(screen.getByText("1:00")).toBeInTheDocument();
});

it("calls onSeek when ruler is clicked", () => {
  const onSeek = vi.fn();
  const { container } = render(
    <TimelineRuler currentTime={0} duration={60} onSeek={onSeek} />,
  );
  const ruler = container.firstChild as HTMLElement;
  // Mock getBoundingClientRect
  Object.defineProperty(ruler, "getBoundingClientRect", {
    value: () => ({ left: 0, width: 600, top: 0, right: 600, bottom: 24, height: 24 }),
  });
  fireEvent.click(ruler, { clientX: 300 });
  expect(onSeek).toHaveBeenCalledWith(expect.closeTo(30, 1));
});
