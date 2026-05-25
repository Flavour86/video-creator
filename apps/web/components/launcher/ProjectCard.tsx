"use client";

import { ChevronRight, Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LauncherRenderStatusTag, RecentProjectCard } from "@vc/shared-schemas";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { ProjectThumb } from "./ProjectThumb";

type ProjectCardProps = {
  onClick: () => void;
  onDelete: () => void;
  onPreview: () => void;
  project: RecentProjectCard;
};

export function ProjectCard({ onClick, onDelete, onPreview, project }: ProjectCardProps) {
  const t = useTranslations("pages.launcher");
  const canPlay = project.latest_render_status === "done" && Boolean(project.latest_render_id);
  const renderedAt = project.last_render_at ? formatRelativeTime(project.last_render_at) : null;

  return (
    <article
      className="grid w-full grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-(--space-7) rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-6) transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-(--bg-5) hover:bg-(--bg-3)"
    >
      <span className="relative">
        <button
          aria-label={`Open ${project.name} thumbnail`}
          className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
          onClick={onClick}
          type="button"
        >
          <ProjectThumb seed={project.name} thumbnailPath={project.thumbnail_path} />
        </button>
        {canPlay ? (
          <button
            aria-label={`Preview ${project.name}`}
            className="absolute bottom-(--space-2) right-(--space-2) grid h-(--space-8) w-(--space-8) place-items-center rounded-(--r-pill) border border-white/45 bg-black/55 text-white shadow-(--shadow-soft) hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
            onClick={onPreview}
            type="button"
          >
            <Play aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
          </button>
        ) : null}
      </span>
      <button
        aria-label={`Open ${project.name}`}
        className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
        onClick={onClick}
        type="button"
      >
        <span className="min-w-0">
          <span className="mb-0.5 block text-base font-semibold leading-tight tracking-normal text-(--text)">
            {project.name}
          </span>
          <span className="flex gap-(--space-6) text-[11.5px] text-(--text-3)">
            <Meta label={t("voice")} value={project.voice_duration || "--"} />
            <Meta label={t("sentences")} value={project.sentence_count} />
            <Meta label={t("media")} value={project.media_count} />
            {renderedAt ? <Meta label={t("lastRender")} value={renderedAt} /> : null}
          </span>
        </span>
      </button>
      <span className="flex items-center gap-(--space-3)">
        {project.render_status_tag ? (
          <StatusTag variant={launcherRenderVariant(project.render_status_tag)}>
            {renderStatusLabel(project.render_status_tag, t)}
          </StatusTag>
        ) : null}
        <button
          aria-label={`Delete ${project.name}`}
          className="grid h-(--space-9) w-(--space-9) place-items-center rounded-(--r-pill) text-(--text-3) hover:bg-(--bg-3) hover:text-(--red) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
          onClick={onDelete}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
        </button>
        <button
          aria-label={`Open ${project.name} details`}
          className="grid h-(--space-9) w-(--space-9) place-items-center rounded-(--r-pill) text-(--text-3) hover:bg-(--bg-3) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
          onClick={onClick}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
        </button>
      </span>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: number | string }) {
  return (
    <span>
      <strong className="font-medium text-(--text-2)">{value}</strong> {label}
    </span>
  );
}

function launcherRenderVariant(status: LauncherRenderStatusTag): StatusTagVariant {
  if (status === "rendered") {
    return "ready";
  }
  if (status === "queued" || status === "rendering") {
    return "info";
  }
  if (status === "failed") {
    return "error";
  }
  return "warning";
}

function renderStatusLabel(
  status: LauncherRenderStatusTag,
  t: (key: string) => string,
): string {
  return t(`renderStatus.${status}`);
}
