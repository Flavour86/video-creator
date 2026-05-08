import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PageChrome } from "./PageChrome";

describe("PageChrome", () => {
  test("renders a full-canvas default page surface", () => {
    render(<PageChrome>Content</PageChrome>);

    const main = screen.getByRole("main");

    expect(main).toHaveTextContent("Content");
    expect(main.className).toContain("w-full");
    expect(main.className).toContain("bg-(--bg-0)");
    expect(main.className).toContain("px-(--space-8)");
    expect(main.className).not.toMatch(/mx-auto|max-w-/);
  });

  test("supports empty and workbench page layouts", () => {
    const { rerender } = render(<PageChrome variant="empty">Empty</PageChrome>);

    expect(screen.getByRole("main").className).toContain("justify-center");

    rerender(<PageChrome variant="workbench">Workbench</PageChrome>);

    expect(screen.getByRole("main").className).toContain("overflow-hidden");
  });
});
