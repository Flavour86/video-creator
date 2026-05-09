import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";
import { StatusTile, type StatusTileState } from "./StatusTile";

function renderTile(state: StatusTileState) {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
      <StatusTile kind="voice" state={state} />
    </NextIntlClientProvider>,
  );
}

describe("StatusTile", () => {
  test.each([
    ["pending", "border-dashed"],
    ["copying", "bg-(--amber-bg)"],
    ["detected", "bg-(--green-bg)"],
    ["invalid", "bg-(--red-bg)"],
  ] as const)("renders %s state", (state, expectedClass) => {
    renderTile(state);
    expect(screen.getByText(state === "detected" ? "copied" : state).closest("div")?.className).toContain(
      expectedClass,
    );
  });

  test("describes accepted voice file types instead of hardcoding wav", () => {
    renderTile("pending");

    expect(screen.getByText("voice file")).toBeInTheDocument();
    expect(screen.getByText("Place voice.wav, voice.mp3, voice.m4a, voice.flac or voice.ogg in the project folder")).toBeInTheDocument();
  });

  test("uses the detected voice filename", () => {
    render(
      <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
        <StatusTile filename="voice.mp3" kind="voice" meta="04:00 · 48kHz · stereo" state="detected" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("voice.mp3")).toBeInTheDocument();
    expect(screen.getByText("04:00 · 48kHz · stereo")).toBeInTheDocument();
  });
});
