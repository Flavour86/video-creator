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
});
