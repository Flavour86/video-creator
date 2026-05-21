import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { LayersPopover } from "./LayersPopover";

function renderPopover(overrides: Partial<ComponentProps<typeof LayersPopover>> = {}) {
  const props: ComponentProps<typeof LayersPopover> = {
    layers: [
      { id: "subtitles", kind: "sub", name: "Subtitles", items: [{ id: "sub-auto", auto: true, label: "Auto subtitles", style: "default" }] },
      {
        id: "fg-z1",
        kind: "fg",
        name: "Foreground z1",
        items: [{
          id: "fg-1",
          mediaId: "foreground.png",
          sentences: [1, 1],
          start: 0,
          end: 5,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "fade", out: "cut" },
          cache_status: "warm",
        }],
      },
      {
        id: "bg-main",
        kind: "bg",
        name: "Background",
        items: [{
          id: "bg-1",
          mediaId: "bg0.png",
          sentences: [1, 1],
          start: 0,
          end: 30,
          motion: { kind: "ken_burns", easing: "ease_in_out" },
          transitions: { in: "cut", out: "cut" },
          crossfade: 0.6,
          cache_status: "warm",
        }],
      },
    ],
    onClose: vi.fn(),
    onRemoveBackground: vi.fn(),
    onSelectLayerItem: vi.fn(),
    open: true,
    selected: null,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LayersPopover {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("LayersPopover", () => {
  it("renders nothing when closed", () => {
    renderPopover({ open: false });

    expect(screen.queryByText("Layer order - top renders on top")).not.toBeInTheDocument();
  });

  it("renders header and layer rows when open", () => {
    renderPopover();

    expect(screen.getByText("Layer order - top renders on top")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foreground z1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Background/i })).toBeInTheDocument();
  });

  it("selects first layer item and closes when clicking a row", () => {
    const props = renderPopover();

    fireEvent.click(screen.getByRole("button", { name: /Foreground z1/i }));

    expect(props.onSelectLayerItem).toHaveBeenCalledWith("fg-z1", "fg-1");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("removes background and closes when clicking background trash", () => {
    const props = renderPopover();

    fireEvent.click(screen.getByRole("button", { name: "Delete layer" }));

    expect(props.onRemoveBackground).toHaveBeenCalledWith("bg-main");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const props = renderPopover();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside click", () => {
    const props = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when outside mousedown is on layers trigger", () => {
    const props = renderPopover();
    const trigger = document.createElement("button");
    trigger.setAttribute("data-editor-layers-trigger", "true");
    document.body.appendChild(trigger);

    fireEvent.mouseDown(trigger);

    expect(props.onClose).not.toHaveBeenCalled();
    trigger.remove();
  });
});
