import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Button } from ".";

describe("Button", () => {
  test("renders a tokenized default button with type button", () => {
    render(<Button>Open folder</Button>);

    const button = screen.getByRole("button", { name: "Open folder" });

    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("vc-type-body");
    expect(button.className).toContain("bg-(--bg-2)");
    expect(button.className).toContain("border-(--line)");
    expect(button.className).toContain("h-(--space-10)");
    expect(button.className).toContain("rounded-(--r)");
  });

  test.each([
    ["primary", "bg-(--blue)"],
    ["render", "bg-(--amber)"],
    ["default", "bg-(--bg-2)"],
    ["ghost", "bg-transparent"],
    ["danger", "bg-(--red)"],
  ] as const)("renders %s variant classes", (variant, expectedClass) => {
    render(<Button variant={variant}>{variant}</Button>);

    expect(screen.getByRole("button", { name: variant }).className).toContain(expectedClass);
  });

  test.each([
    ["default", "h-(--space-10)"],
    ["small", "h-(--space-9)"],
    ["extra-small", "h-(--space-8)"],
    ["icon-only", "w-(--space-9)"],
  ] as const)("renders %s size classes", (size, expectedClass) => {
    render(<Button size={size}>{size}</Button>);

    expect(screen.getByRole("button", { name: size }).className).toContain(expectedClass);
  });

  test("supports disabled and caller-provided classes", () => {
    render(
      <Button className="custom-button" disabled>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });

    expect(button).toBeDisabled();
    expect(button.className).toContain("disabled:cursor-not-allowed");
    expect(button.className).toContain("custom-button");
  });
});
