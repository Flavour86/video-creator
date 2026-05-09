import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RuntimeHealthResponse } from "@vc/shared-schemas";
import { dictionaries } from "@/lib/i18n/messages";
import { RuntimeCard } from "./RuntimeCard";

let runtimeStatus: RuntimeHealthResponse | null = null;
let runtimeError: string | null = null;
let runtimeLoading = false;

vi.mock("@/lib/hooks/useRuntimeStatus", () => ({
  useRuntimeStatus: () => ({
    status: runtimeStatus,
    error: runtimeError,
    isLoading: runtimeLoading,
    refresh: vi.fn(),
  }),
}));

const REAL_RUNTIME: RuntimeHealthResponse = {
  status: "ok",
  version: "0.1.0",
  active_renders: 2,
  cached_projects: 1,
  sidecar: { status: "ready", address: "http://127.0.0.1:8787", version: "0.1.0" },
  node: { status: "ready", version: "22.18.0" },
  python: { status: "ready", version: "3.11.9" },
  ffmpeg: { status: "ready", version: "7.1.0" },
  cuda: { status: "unavailable", available: false, version: "unknown", gpu_label: null },
  whisperx: { status: "ready", model: "large-v3" },
};

function renderRuntimeCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
      <RuntimeCard />
    </NextIntlClientProvider>,
  );
}

describe("RuntimeCard", () => {
  beforeEach(() => {
    runtimeStatus = REAL_RUNTIME;
    runtimeError = null;
    runtimeLoading = false;
  });

  test("renders versions and metrics from the health payload", () => {
    renderRuntimeCard();

    expect(screen.getByText("22.18.0")).toBeInTheDocument();
    expect(screen.getByText("3.11.9")).toBeInTheDocument();
    expect(screen.getByText("7.1.0")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("6.1.1 路 libx264")).not.toBeInTheDocument();
  });

  test("renders unavailable rows and zero metrics when health is missing", () => {
    runtimeStatus = null;
    runtimeError = "Runtime status unavailable";

    renderRuntimeCard();

    expect(screen.getAllByText("unavailable")).toHaveLength(6);
    expect(screen.getAllByText("0")).toHaveLength(2);
  });
});
