import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("Video Creator")).toBeInTheDocument();
  });

  it("shows ok when sidecar responds", async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });
});
