import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Checkbox, Field, NumberInput, SearchInput, Select, TextInput } from ".";

describe("form primitives", () => {
  test("pairs eyebrow labels with tokenized text inputs", () => {
    render(
      <Field htmlFor="project-name" label="Project name">
        <TextInput id="project-name" placeholder="Tokyo Essay" />
      </Field>,
    );

    const label = screen.getByText("Project name");
    const input = screen.getByLabelText("Project name");

    expect(label.className).toContain("vc-type-eyebrow");
    expect(label.className).toContain("text-(--text-3)");
    expect(input).toHaveAttribute("placeholder", "Tokyo Essay");
    expect(input.className).toContain("bg-(--bg-1)");
    expect(input.className).toContain("border-(--line)");
    expect(input.className).toContain("rounded-(--r)");
    expect(input.className).toContain("text-(--text)");
  });

  test("renders a search input with stable searchbox semantics", () => {
    render(<SearchInput aria-label="Search projects" />);

    const search = screen.getByRole("searchbox", { name: "Search projects" });

    expect(search).toHaveAttribute("type", "search");
    expect(search.className).toContain("pl-(--space-9)");
    expect(screen.getByTestId("search-input-icon")).toHaveAttribute("aria-hidden", "true");
  });

  test("renders select controls with the same tokenized field shell", () => {
    render(
      <Field htmlFor="motion" label="Motion">
        <Select id="motion">
          <option value="none">None</option>
          <option value="zoom_in">Zoom in</option>
        </Select>
      </Field>,
    );

    const select = screen.getByLabelText("Motion");

    expect(select).toHaveValue("none");
    expect(select.className).toContain("bg-(--bg-1)");
    expect(select.className).toContain("border-(--line)");
    expect(select.className).toContain("rounded-(--r)");
  });

  test("renders numeric inputs as native spinbuttons", () => {
    render(<NumberInput aria-label="Opacity" max={100} min={0} step={1} />);

    const input = screen.getByRole("spinbutton", { name: "Opacity" });

    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input.className).toContain("text-(--text)");
  });

  test("renders checkbox controls with tokenized accent treatment", () => {
    render(<Checkbox aria-label="Burn subtitles" />);

    const checkbox = screen.getByRole("checkbox", { name: "Burn subtitles" });

    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(checkbox.className).toContain("accent-(--blue)");
    expect(checkbox.className).toContain("rounded-(--r-sm)");
  });
});
