"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AlignmentState, RecentProject } from "@vc/shared-schemas";
import { StatusTag, type StatusTagVariant } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { ProjectThumb } from "./ProjectThumb";

type ProjectCardProps = {
  onClick: () => void;
  project: RecentProject;
};

type EmptyProjectCardProps = {
  onClick: () => void;
  variant: "empty";
};

export function ProjectCard(props: ProjectCardProps | EmptyProjectCardProps) {
  const t = useTranslations("pages.launcher");

  if ("variant" in props) {
    return (
      <button
        className="flex min-h-[64px] w-full items-center justify-center gap-(--space-3) rounded-(--r) border border-dashed border-(--line) bg-(--bg-2) p-(--space-6) text-(--text-3) transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-(--bg-5) hover:bg-(--bg-3) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
        onClick={props.onClick}
        type="button"
      >
        <Plus aria-hidden="true" className="h-(--space-5) w-(--space-5)" />
        <span className="vc-type-body text-(--text-3)">{t("createAnother")}</span>
      </button>
    );
  }

  const { project } = props;

  return (
    <button
      className="grid w-full grid-cols-[130px_1fr_auto] items-center gap-(--space-7) rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-6) text-left transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-(--bg-5) hover:bg-(--bg-3) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
      onClick={props.onClick}
      type="button"
    >
      <ProjectThumb seed={project.palette_seed || project.name} />
      <span className="min-w-0">
        <span className="mb-0.5 block text-base font-semibold leading-tight tracking-normal text-(--text)">
          {project.name}
        </span>
        <span className="mb-(--space-3) block truncate font-mono text-[11.5px] text-(--text-3)">
          {project.path}
        </span>
        <span className="flex gap-(--space-6) text-[11.5px] text-(--text-3)">
          <Meta label={t("voice")} value={project.voice_duration || "--"} />
          <Meta label={t("sentences")} value={project.sentence_count} />
          <Meta label={t("media")} value={project.media_count} />
          <Meta label={t("opened")} value={formatRelativeTime(project.last_opened_at)} />
        </span>
      </span>
      <span className="flex items-center gap-(--space-3)">
        <StatusTag variant={statusVariant(project.alignment_state)}>{t(`status.${project.alignment_state}`)}</StatusTag>
        <ChevronRight aria-hidden="true" className="h-(--space-4) w-(--space-4) text-(--text-3)" />
      </span>
    </button>
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
