import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Kbd } from ".";

describe("Kbd", () => {
  test("renders keyboard command text with mono token styling", () => {
    render(<Kbd>Ctrl+K</Kbd>);

    const chip = screen.getByText("Ctrl+K");

    expect(chip.tagName).toBe("KBD");
    expect(chip.className).toContain("vc-type-mono-meta");
    expect(chip.className).toContain("bg-(--bg-2)");
    expect(chip.className).toContain("border-(--line)");
    expect(chip.className).toContain("rounded-(--r-sm)");
  });

  test.each(["Cmd+K", "Ctrl+F", "Space"])("supports %s command chips", (command) => {
    render(<Kbd>{command}</Kbd>);

    expect(screen.getByText(command)).toBeInTheDocument();
  });

  test("supports caller-provided classes", () => {
    render(<Kbd className="custom-kbd">Space</Kbd>);

    expect(screen.getByText("Space").className).toContain("custom-kbd");
  });
});
