import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SegmentedControl } from ".";

const navItems = [
  { value: "launcher", label: "Launcher" },
  { value: "setup", label: "Setup" },
  { value: "editor", label: "Editor" },
];

describe("SegmentedControl", () => {
  test("renders a tokenized radiogroup with checked item state", () => {
    render(
      <SegmentedControl
        ariaLabel="Primary navigation"
        items={navItems}
        onValueChange={vi.fn()}
        value="setup"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Primary navigation" }).className).toContain("bg-(--bg-1)");
    expect(screen.getByRole("radio", { name: "Launcher" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Setup" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Setup" }).className).toContain("bg-(--bg-4)");
  });

  test("calls onValueChange when selecting a different item", () => {
    const onValueChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Primary navigation"
        items={navItems}
        onValueChange={onValueChange}
        value="launcher"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Editor" }));

    expect(onValueChange).toHaveBeenCalledWith("editor");
  });

  test("does not emit changes for active or disabled items", () => {
    const onValueChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Preview scale"
        items={[
          { value: "fit", label: "Fit" },
          { value: "actual", label: "Actual", disabled: true },
        ]}
        onValueChange={onValueChange}
        value="fit"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Fit" }));
    fireEvent.click(screen.getByRole("radio", { name: "Actual" }));

    expect(screen.getByRole("radio", { name: "Actual" })).toBeDisabled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test("supports accent active treatment for render and mode controls", () => {
    render(
      <SegmentedControl
        ariaLabel="Resolution"
        items={[
          { value: "draft", label: "Draft" },
          { value: "final", label: "Final" },
        ]}
        onValueChange={vi.fn()}
        tone="accent"
        value="final"
      />,
    );

    expect(screen.getByRole("radio", { name: "Final" }).className).toContain("bg-(--blue)");
  });
});
