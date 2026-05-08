import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Surface } from ".";

describe("Surface", () => {
  test("renders a default flat panel surface with tokenized shell classes", () => {
    render(<Surface data-testid="surface">Workspace</Surface>);

    const surface = screen.getByTestId("surface");

    expect(surface.tagName).toBe("DIV");
    expect(surface.className).toContain("bg-(--bg-1)");
    expect(surface.className).toContain("border-(--line)");
    expect(surface.className).toContain("rounded-(--r)");
    expect(surface.className).toContain("p-(--space-6)");
    expect(surface.className).toContain("text-(--text)");
  });

  test("supports raised and compact surfaces without changing the API into card nesting", () => {
    render(
      <Surface data-testid="surface" padding="small" tone="raised">
        Runtime
      </Surface>,
    );

    const surface = screen.getByTestId("surface");

    expect(surface.className).toContain("bg-(--bg-2)");
    expect(surface.className).toContain("shadow-(--shadow-1)");
    expect(surface.className).toContain("p-(--space-4)");
    expect(surface.className).not.toMatch(/card/i);
  });

  test("supports caller-provided classes", () => {
    render(
      <Surface className="custom-surface" data-testid="surface">
        Details
      </Surface>,
    );

    expect(screen.getByTestId("surface").className).toContain("custom-surface");
  });
});
