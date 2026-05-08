import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LayerChip } from ".";

describe("LayerChip", () => {
  test.each([
    ["subtitles", "Subtitles", "border-(--violet)"],
    ["pip", "PiP", "border-(--blue)"],
    ["foreground", "Foreground", "border-(--amber)"],
    ["background", "Background", "border-(--green)"],
  ] as const)("renders %s layer semantics with tokenized tone", (variant, label, borderClass) => {
    render(<LayerChip data-testid="chip" label={label} variant={variant} />);

    const chip = screen.getByTestId("chip");

    expect(chip).toHaveClass("vc-type-caption");
    expect(chip?.className).toContain(borderClass);
    expect(chip?.className).toContain("bg-(--bg-2)");
    expect(chip?.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  test("preserves foreground z-order language", () => {
    render(<LayerChip label="Foreground" variant="foreground" zIndex={2} />);

    expect(screen.getByText("Foreground")).toBeInTheDocument();
    expect(screen.getByText("z2")).toBeInTheDocument();
  });

  test("preserves PiP z-order language", () => {
    render(<LayerChip label="PiP" variant="pip" zIndex={1} />);

    expect(screen.getByText("PiP")).toBeInTheDocument();
    expect(screen.getByText("z1")).toBeInTheDocument();
  });

  test("supports caller-provided classes", () => {
    render(<LayerChip className="custom-layer-chip" data-testid="chip" label="Background" variant="background" />);

    expect(screen.getByTestId("chip").className).toContain("custom-layer-chip");
  });
});
