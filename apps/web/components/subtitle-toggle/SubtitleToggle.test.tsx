import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubtitleToggle } from "./SubtitleToggle";

describe("SubtitleToggle", () => {
  it("renders the switch state", () => {
    render(<SubtitleToggle burnIn={true} onChange={vi.fn()} />);

    expect(screen.getByRole("switch", { name: /burn subtitles/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("calls onChange with the next value", () => {
    const onChange = vi.fn();
    render(<SubtitleToggle burnIn={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch", { name: /burn subtitles/i }));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
