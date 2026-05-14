"use client";

import { ChevronRight, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AlignmentState, ProjectStatus, RecentProjectCard, RenderStatus } from "@vc/shared-schemas";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { ProjectThumb } from "./ProjectThumb";

type ProjectCardProps = {
  onClick: () => void;
  onPlayLatest: () => void;
  project: RecentProjectCard;
};

export function ProjectCard({ onClick, onPlayLatest, project }: ProjectCardProps) {
  const t = useTranslations("pages.launcher");
  const canPlay = project.latest_render_status === "done" && Boolean(project.latest_render_id);

  return (
    <article className="grid w-full grid-cols-[130px_1fr_auto] items-center gap-(--space-7) rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-6) transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-(--bg-5) hover:bg-(--bg-3)">
      <ProjectThumb seed={project.name} />
      <span className="min-w-0">
        <span className="mb-0.5 block text-base font-semibold leading-tight tracking-normal text-(--text)">
          {project.name}
        </span>
        <span className="flex gap-(--space-6) text-[11.5px] text-(--text-3)">
          <Meta label={t("voice")} value={project.voice_duration || "--"} />
          <Meta label={t("sentences")} value={project.sentence_count} />
          <Meta label={t("media")} value={project.media_count} />
          <Meta label={t("opened")} value={formatRelativeTime(project.last_render_at)} />
        </span>
      </span>
      <span className="flex items-center gap-(--space-3)">
        {project.latest_render_status ? (
          <StatusTag variant={renderVariant(project.latest_render_status)}>
            {project.latest_render_status}
          </StatusTag>
        ) : null}
        <StatusTag variant={projectStatusVariant(project.status)}>{project.status.replace("_", " ")}</StatusTag>
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
          aria-label={`Open ${project.name}`}
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

function projectStatusVariant(status: ProjectStatus): StatusTagVariant {
  if (status === "ready") {
    return "ready";
  }
  if (status === "rendering") {
    return "info";
  }
  return status === "corrupt" || status === "alignment_failed" ? "error" : "warning";
}

function renderVariant(status: RenderStatus): StatusTagVariant {
  if (status === "done") {
    return "ready";
  }
  if (status === "running" || status === "queued") {
    return "info";
  }
  return status === "error" ? "error" : "warning";
}
