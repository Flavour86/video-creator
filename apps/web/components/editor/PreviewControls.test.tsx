import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { PreviewControls } from "./PreviewControls";

function renderControls(overrides: Partial<ComponentProps<typeof PreviewControls>> = {}) {
  const props: ComponentProps<typeof PreviewControls> = {
    layerCount: 4,
    layersOpen: false,
    onLayers: vi.fn(),
    onSetResolution: vi.fn(),
    resolution: "1080p",
    ...overrides,
  };
  const rendered = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PreviewControls {...props} />
    </NextIntlClientProvider>,
  );
  return { ...rendered, props };
}

describe("PreviewControls", () => {
  it("renders all resolution presets and Layers - N label", () => {
    renderControls();

    expect(screen.getByRole("radio", { name: "1080p" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "720p" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "9:16" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Layers - 4" })).toBeInTheDocument();
  });

  it("calls onSetResolution when a different preset is selected", () => {
    const { props } = renderControls({ resolution: "1080p" });

    fireEvent.click(screen.getByRole("radio", { name: "720p" }));

    expect(props.onSetResolution).toHaveBeenCalledWith("720p");
  });

  it("calls onLayers when the layers button is clicked", () => {
    const { props } = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));

    expect(props.onLayers).toHaveBeenCalledTimes(1);
  });

  it("reflects popover visibility via aria-expanded", () => {
    const { rerender } = renderControls({ layersOpen: false });
    expect(screen.getByRole("button", { name: "Layers - 4" })).toHaveAttribute("aria-expanded", "false");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreviewControls
          layerCount={4}
          layersOpen
          onLayers={vi.fn()}
          onSetResolution={vi.fn()}
          resolution="1080p"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Layers - 4" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Layers - 4" })).toHaveAttribute("aria-controls", "editor-layers-popover");
  });
});
