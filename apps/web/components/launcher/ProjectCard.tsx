"use client";

import { ChevronRight, Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AlignmentState, LauncherRenderStatusTag, RecentProjectCard } from "@vc/shared-schemas";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { ProjectThumb } from "./ProjectThumb";

type ProjectCardProps = {
  onClick: () => void;
  onDelete: () => void;
  onPlayLatest: () => void;
  project: RecentProjectCard;
};

export function ProjectCard({ onClick, onDelete, onPlayLatest, project }: ProjectCardProps) {
  const t = useTranslations("pages.launcher");
  const canPlay = project.latest_render_status === "done" && Boolean(project.latest_render_id);
  const openedAt = project.last_render_at ? formatRelativeTime(project.last_render_at) : null;

  return (
    <article
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-(--space-7) rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-6) transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-(--bg-5) hover:bg-(--bg-3)"
    >
      <button
        aria-label={`Open ${project.name}`}
        className="grid min-w-0 grid-cols-[130px_minmax(0,1fr)] items-center gap-(--space-7) text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
        onClick={onClick}
        type="button"
      >
        <ProjectThumb seed={project.name} />
        <span className="min-w-0">
          <span className="mb-0.5 block text-base font-semibold leading-tight tracking-normal text-(--text)">
            {project.name}
          </span>
          <span className="flex gap-(--space-6) text-[11.5px] text-(--text-3)">
            <Meta label={t("voice")} value={project.voice_duration || "--"} />
            <Meta label={t("sentences")} value={project.sentence_count} />
            <Meta label={t("media")} value={project.media_count} />
            {openedAt ? <Meta label={t("opened")} value={openedAt} /> : null}
          </span>
        </span>
      </button>
      <span className="flex items-center gap-(--space-3)">
        {project.render_status_tag ? (
          <StatusTag variant={launcherRenderVariant(project.render_status_tag)}>
            {project.render_status_tag}
          </StatusTag>
        ) : null}
        <StatusTag variant={statusVariant(project.alignment_state)}>{t(`status.${project.alignment_state}`)}</StatusTag>
        {canPlay ? (
          <button
            className="inline-flex h-(--space-9) items-center gap-(--space-2) rounded-(--r-sm) border border-(--line) px-(--space-3) text-xs font-semibold text-(--text-2) hover:bg-(--bg-3) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
            onClick={onPlayLatest}
            type="button"
          >
            <Play aria-hidden="true" className="h-(--space-3) w-(--space-3)" />
            Play render
          </button>
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

function statusVariant(state: AlignmentState): StatusTagVariant {
  if (state === "aligned") {
    return "aligned";
  }
  return state === "pending" ? "warning" : "missing-asset";
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
