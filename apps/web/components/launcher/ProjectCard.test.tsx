import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import type { RecentProjectCard } from "@vc/shared-schemas";
import { dictionaries } from "@/lib/i18n/messages";
import { ProjectCard } from "./ProjectCard";

const PROJECT: RecentProjectCard = {
  project_id: "p_rendered",
  name: "Rendered",
  last_render_at: "2026-05-07T00:00:00Z",
  voice_duration: "01:10",
  sentence_count: 12,
  media_count: 3,
  alignment_state: "aligned",
  status: "ready",
  thumbnail_path: "/projects/p_rendered/thumbnail/render-r_done.jpg",
  has_unrendered_changes: false,
  latest_render_id: "r_done",
  latest_render_status: "done",
  render_status_tag: "rendered",
};

function renderCard(project: RecentProjectCard = PROJECT) {
  const handlers = {
    onClick: vi.fn(),
    onDelete: vi.fn(),
    onPreview: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en} timeZone="UTC">
      <ProjectCard project={project} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

it("renders server thumbnail and opens preview from thumbnail play control", () => {
  const handlers = renderCard();
  expect(screen.getByRole("img", { name: "Rendered thumbnail" })).toHaveAttribute(
    "src",
    "/api/server/projects/p_rendered/thumbnail/render-r_done.jpg",
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview Rendered" }));
  expect(handlers.onPreview).toHaveBeenCalledTimes(1);
  expect(handlers.onClick).not.toHaveBeenCalled();
});

it("uses deterministic fallback art when no thumbnail path exists", () => {
  renderCard({
    ...PROJECT,
    thumbnail_path: null,
    latest_render_id: null,
    latest_render_status: null,
    render_status_tag: "unrendered",
  });
  expect(screen.getByTestId("project-thumb-fallback")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Preview Rendered" })).not.toBeInTheDocument();
});
