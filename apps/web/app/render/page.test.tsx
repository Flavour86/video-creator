import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectParam: null as string | null,
  renderIdParam: null as string | null,
  startFinal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "project") return mocks.projectParam;
      if (key === "renderId") return mocks.renderIdParam;
      return null;
    },
  }),
}));

vi.mock("@/lib/hooks/useRenderProgress", () => ({
  useRenderProgress: () => ({
    state: { status: "idle" },
    startFinal: mocks.startFinal,
    cancel: vi.fn(),
  }),
}));

vi.mock("@/components/render-history/RenderHistory", () => ({
  RenderHistory: ({ projectPath }: { projectPath: string }) => (
    <div data-testid="render-history">History {projectPath}</div>
  ),
}));

import RenderPage from "./page";

beforeEach(() => {
  mocks.projectParam = null;
  mocks.renderIdParam = null;
  mocks.startFinal.mockReset();
});

it("shows no-project message when project param is absent", () => {
  render(<RenderPage />);

  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
  expect(mocks.startFinal).not.toHaveBeenCalled();
});

it("auto-starts a final render for a project route", async () => {
  mocks.projectParam = "E:/projects/demo";
  render(<RenderPage />);

  expect(screen.getByText("Final Render")).toBeInTheDocument();
  expect(screen.getByTestId("render-history")).toHaveTextContent("E:/projects/demo");
  await waitFor(() => expect(mocks.startFinal).toHaveBeenCalledTimes(1));
});

it("does not auto-start when viewing an existing render", async () => {
  mocks.projectParam = "E:/projects/demo";
  mocks.renderIdParam = "r-existing";
  render(<RenderPage />);

  await waitFor(() => expect(screen.getByText("Final Render")).toBeInTheDocument());
  expect(mocks.startFinal).not.toHaveBeenCalled();
});
