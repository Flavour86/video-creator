import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import { dictionaries } from "@/lib/i18n/messages";
import TokensPage from "./page";

function renderTokensPage(locale: "en" | "zh" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={dictionaries[locale]} timeZone="UTC">
      <TokensPage />
    </NextIntlClientProvider>,
  );
}

describe("TokensPage", () => {
  test("renders a developer-visible tokens route", () => {
    renderTokensPage();

    expect(screen.getByRole("heading", { name: "Tokens" })).toBeInTheDocument();
    expect(screen.getByText("Design Tokens")).toBeInTheDocument();
    expect(screen.getByText("Colors")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Spacing")).toBeInTheDocument();
    expect(screen.getByText("Radii")).toBeInTheDocument();
    expect(screen.getByText("Shadows")).toBeInTheDocument();
    expect(screen.getByText("Cinema")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
  });

  test("documents token families and cinema constants", () => {
    renderTokensPage();

    expect(screen.getByText("--bg-0")).toBeInTheDocument();
    expect(screen.getByText("--text-4")).toBeInTheDocument();
    expect(screen.getByText("Inter Tight / system sans")).toBeInTheDocument();
    expect(screen.getByText("--space-12")).toBeInTheDocument();
    expect(screen.getByText("--r-pill")).toBeInTheDocument();
    expect(screen.getByText("--shadow-2")).toBeInTheDocument();
    expect(screen.getByText("--cinema-pip-max-scale")).toBeInTheDocument();
    expect(screen.getByText("--cinema-playhead-width")).toBeInTheDocument();
  });

  test("renders live shared primitive samples", () => {
    renderTokensPage();

    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Mode sample" })).toBeInTheDocument();
    expect(screen.getAllByText("aligned").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Project path")).toBeInTheDocument();
    expect(screen.getByText("cmd K")).toBeInTheDocument();
    expect(screen.getByText("Foreground")).toBeInTheDocument();
  });

  test("localizes the reference shell labels", () => {
    renderTokensPage("zh");

    expect(screen.getByRole("heading", { name: "令牌" })).toBeInTheDocument();
    expect(screen.getByText("影像")).toBeInTheDocument();
    expect(screen.getByText("组件")).toBeInTheDocument();
  });
});
