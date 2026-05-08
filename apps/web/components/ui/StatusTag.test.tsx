import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StatusTag } from ".";

describe("StatusTag", () => {
  test("renders a tokenized pill tag with status text", () => {
    render(<StatusTag variant="aligned">aligned</StatusTag>);

    const tag = screen.getByText("aligned");

    expect(tag.className).toContain("vc-type-caption");
    expect(tag.className).toContain("vc-radius-pill");
    expect(tag.className).toContain("bg-(--green)");
    expect(tag.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  test.each([
    ["idle", "bg-(--bg-3)"],
    ["cached", "bg-(--violet)"],
    ["aligned", "bg-(--green)"],
    ["composing", "bg-(--amber)"],
    ["missing-asset", "bg-(--red)"],
    ["ready", "bg-(--green)"],
    ["warning", "bg-(--amber)"],
    ["info", "bg-(--blue)"],
    ["error", "bg-(--red)"],
  ] as const)("maps %s to the expected token color", (variant, expectedClass) => {
    render(<StatusTag variant={variant}>{variant}</StatusTag>);

    expect(screen.getByText(variant).className).toContain(expectedClass);
  });

  test("supports caller-provided classes", () => {
    render(
      <StatusTag className="custom-tag" variant="info">
        ready
      </StatusTag>,
    );

    expect(screen.getByText("ready").className).toContain("custom-tag");
  });
});
