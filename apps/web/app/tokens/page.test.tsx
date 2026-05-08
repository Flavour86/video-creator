import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import TokensPage from "./page";

describe("TokensPage", () => {
  test("renders a developer-visible tokens route", () => {
    render(<TokensPage />);

    expect(screen.getByRole("heading", { name: "Tokens" })).toBeInTheDocument();
    expect(screen.getByText("Design Tokens")).toBeInTheDocument();
    expect(screen.getByText("Colors")).toBeInTheDocument();
    expect(screen.getByText("Typography")).toBeInTheDocument();
    expect(screen.getByText("Space")).toBeInTheDocument();
    expect(screen.getByText("Cinema")).toBeInTheDocument();
  });
});
