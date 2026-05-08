import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { Button, IconButton, LayerChip, SegmentedControl, StatusTag } from ".";

const primitiveSourceFiles = [
  "Button.tsx",
  "Form.tsx",
  "IconButton.tsx",
  "Kbd.tsx",
  "LayerChip.tsx",
  "SegmentedControl.tsx",
  "StatusTag.tsx",
  "Surface.tsx",
] as const;

describe("shared UI primitive coverage", () => {
  test("renders representative class variants for shared primitives", () => {
    render(
      <>
        <Button variant="render">Render</Button>
        <StatusTag variant="aligned">aligned</StatusTag>
        <LayerChip data-testid="foreground-chip" label="Foreground" variant="foreground" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Render" }).className).toContain("bg-(--amber)");
    expect(screen.getByText("aligned").className).toContain("bg-(--green)");
    expect(screen.getByTestId("foreground-chip").className).toContain("border-(--amber)");
  });

  test("keeps icon-only controls accessible by name", () => {
    render(<IconButton icon={FolderOpen} label="Open folder" />);

    const button = screen.getByRole("button", { name: "Open folder" });

    expect(button).toHaveAttribute("title", "Open folder");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("preserves disabled and active states", () => {
    const onValueChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Preview mode"
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

    expect(screen.getByRole("radio", { name: "Fit" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Fit" }).className).toContain("bg-(--bg-4)");
    expect(screen.getByRole("radio", { name: "Actual" })).toBeDisabled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test.each(primitiveSourceFiles)("%s uses theme tokens instead of raw palette branches", (sourceFile) => {
    const source = readFileSync(join(process.cwd(), "components", "ui", sourceFile), "utf8");

    expect(source).not.toMatch(/\b(?:bg|text|border)-(?:neutral|slate|zinc|gray|stone|white|black|red|green|blue|amber|violet)(?:-\d+)?\b/);
    expect(source).not.toContain("dark:");
  });
});
