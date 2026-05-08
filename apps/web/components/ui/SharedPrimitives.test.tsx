import { fireEvent, render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { Button, IconButton, LayerChip, SegmentedControl, StatusTag } from ".";

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
});
