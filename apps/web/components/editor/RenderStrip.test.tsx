import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { RenderStrip } from "./RenderStrip";

function renderStrip(props: Parameters<typeof RenderStrip>[0]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RenderStrip {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RenderStrip", () => {
  it("stays hidden while idle", () => {
    renderStrip({ job: { phase: "", progress: 0, running: false, status: "idle" } });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows queued draft progress and cancel while cancellable", () => {
    const onCancel = vi.fn();
    renderStrip({
      job: {
        phase: "cache_warm",
        progress: 12,
        renderId: "r-draft",
        running: true,
        status: "queued",
      },
      onCancel,
    });

    expect(screen.getByText("Rendering draft : Queued")).toBeInTheDocument();
    expect(screen.getByText("cache_warm")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Draft render progress" })).toHaveAttribute("aria-valuenow", "12");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps completed drafts visible without cancel", () => {
    renderStrip({
      job: {
        phase: "ready",
        progress: 100,
        renderId: "r-draft",
        running: false,
        status: "ready",
      },
    });

    expect(screen.getByText("Rendering draft : Ready")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});
