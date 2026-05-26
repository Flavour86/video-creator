import { act, fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByText("Rendering draft : queued")).toBeInTheDocument();
    expect(screen.getByText("verifying cache")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Draft render progress" })).toHaveAttribute("aria-valuenow", "12");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps completed draft progress visible for two seconds before hiding", () => {
    vi.useFakeTimers();
    try {
      renderStrip({
        job: {
          phase: "ready",
          progress: 100,
          renderId: "r-draft",
          running: false,
          status: "ready",
        },
      });

      expect(screen.getByText("Rendering draft : done")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Draft render progress" })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1_999));
      expect(screen.getByText("Rendering draft : done")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole("progressbar", { name: "Draft render progress" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps cancelled and failed draft progress visible until their linger elapses", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <RenderStrip
            job={{
              phase: "cancelled",
              progress: 0,
              renderId: "r-cancelled",
              running: false,
              status: "cancelled",
            }}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText("Rendering draft : cancelled")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.queryByRole("progressbar", { name: "Draft render progress" })).not.toBeInTheDocument();

      rerender(
        <NextIntlClientProvider locale="en" messages={messages}>
          <RenderStrip
            job={{
              phase: "failed",
              progress: 12,
              renderId: "r-failed",
              running: false,
              status: "failed",
            }}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText("Rendering draft : failed")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps subtitles and compose stage messages to canonical labels", () => {
    renderStrip({
      job: {
        phase: "cache_warm",
        progress: 33,
        renderId: "r-draft",
        running: true,
        status: "running",
        message: "building subtitles.srt",
      },
    });

    expect(screen.getByText("Rendering draft : running")).toBeInTheDocument();
    expect(screen.getByText("building subtitles.srt")).toBeInTheDocument();
  });
});
