import { render, screen } from "@testing-library/react";
import { FolderOpen, Trash2 } from "lucide-react";
import { describe, expect, test } from "vitest";

import { IconButton } from ".";

describe("IconButton", () => {
  test("renders a labeled icon-only button with tooltip text", () => {
    render(<IconButton icon={FolderOpen} label="Open folder" />);

    const button = screen.getByRole("button", { name: "Open folder" });

    expect(button).toHaveAttribute("title", "Open folder");
    expect(button.className).toContain("w-(--space-9)");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("allows custom tooltip text without changing the accessible name", () => {
    render(<IconButton icon={FolderOpen} label="Open folder" title="Choose a local folder" />);

    const button = screen.getByRole("button", { name: "Open folder" });

    expect(button).toHaveAttribute("title", "Choose a local folder");
  });

  test("forwards Button variant and disabled state", () => {
    render(<IconButton disabled icon={Trash2} label="Delete project" variant="danger" />);

    const button = screen.getByRole("button", { name: "Delete project" });

    expect(button).toBeDisabled();
    expect(button.className).toContain("bg-(--red)");
  });
});
