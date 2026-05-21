"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PaginationMeta, RecentProjectCard, RecentProjectsPage } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { ProjectCard } from "@/components/launcher/ProjectCard";
import { Button } from "@/components/ui";
import { request } from "@/lib/api/server";

const PAGE_SIZE = 6;
const emptyPagination: PaginationMeta = {
  page_index: 0,
  page_size: PAGE_SIZE,
  total_count: 0,
  total_pages: 0,
};

export default function LauncherPage() {
  const t = useTranslations("pages.launcher");
  const router = useRouter();
  const [projects, setProjects] = useState<RecentProjectCard[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(emptyPagination);
  const [pageIndex, setPageIndex] = useState(0);
  const [recentError, setRecentError] = useState(false);
  const [previewProject, setPreviewProject] = useState<RecentProjectCard | null>(null);

  const loadRecent = useCallback(async (nextPageIndex = pageIndex) => {
    try {
      const response = await request<RecentProjectsPage>(
        `/projects?page_size=${PAGE_SIZE}&page_index=${nextPageIndex}` as `/${string}`,
      );
      setProjects(response.items);
      setPagination(response.pagination);
      setRecentError(false);
    } catch {
      setProjects([]);
      setPagination({ ...emptyPagination, page_index: nextPageIndex });
      setRecentError(true);
    }
  }, [pageIndex]);

  useEffect(() => {
    void loadRecent(pageIndex);
  }, [loadRecent, pageIndex]);

  function openProject(project: RecentProjectCard) {
    router.push(`/editor/${encodeURIComponent(project.project_id)}`);
  }

  function openPreview(project: RecentProjectCard) {
    if (project.latest_render_id) {
      setPreviewProject(project);
    }
  }

  async function deleteProject(project: RecentProjectCard) {
    try {
      await request(`/projects/${encodeURIComponent(project.project_id)}` as `/${string}`, { method: "DELETE" });
      const nextPageIndex = projects.length === 1 && pageIndex > 0 ? pageIndex - 1 : pageIndex;
      setPageIndex(nextPageIndex);
      await loadRecent(nextPageIndex);
    } catch {
      setRecentError(true);
    }
  }

  return (
    <PageChrome className="mx-auto max-w-350 p-(--space-9)">
      <header className="col-span-full mb-4.5 flex items-end justify-between gap-(--space-7)">
        <div className="whitespace-nowrap">
          <p className="vc-type-eyebrow mb-(--space-2) text-(--text-3)">{t("eyebrow")}</p>
          <h1 className="vc-type-display">{t("title")}</h1>
        </div>
        <div className="flex gap-(--space-3)">
          <Button onClick={() => router.push("/setup")} variant="primary">
            <Plus aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
            {t("newProject")}
          </Button>
        </div>
      </header>
      <section className="space-y-2.5">
        {recentError ? (
          <div className="rounded-(--r) border border-(--amber-line) bg-(--amber-bg) px-(--space-5) py-(--space-4) text-xs text-(--text-2)">
            {t("recentUnavailable")}
          </div>
        ) : null}
        {projects.length === 0 && !recentError ? (
          <div className="rounded-(--r) border border-dashed border-(--line) bg-(--bg-2) px-(--space-6) py-(--space-8) text-center text-sm text-(--text-3)">
            No projects yet.
          </div>
        ) : null}
        {projects.map((project) => (
          <ProjectCard
            key={project.project_id}
            onClick={() => openProject(project)}
            onDelete={() => void deleteProject(project)}
            onPreview={() => openPreview(project)}
            project={project}
          />
        ))}
        {pagination.total_pages > 1 ? (
          <nav
            aria-label="Recent projects pagination"
            className="flex items-center justify-end gap-(--space-3) pt-(--space-4)"
          >
            <Button
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              size="small"
              variant="ghost"
            >
              Previous
            </Button>
            <span className="text-xs font-medium text-(--text-3)">
              Page {pagination.page_index + 1} of {pagination.total_pages}
            </span>
            <Button
              disabled={pagination.page_index + 1 >= pagination.total_pages}
              onClick={() => setPageIndex((value) => value + 1)}
              size="small"
              variant="ghost"
            >
              Next
            </Button>
          </nav>
        ) : null}
      </section>
      {previewProject ? (
        <div
          aria-label={`Preview ${previewProject.name}`}
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-(--space-8)"
          role="dialog"
        >
          <div className="w-full max-w-250 rounded-(--r) border border-(--line) bg-(--bg) p-(--space-5) shadow-(--shadow-pop)">
            <div className="mb-(--space-4) flex items-center justify-between gap-(--space-4)">
              <h2 className="truncate text-base font-semibold tracking-normal text-(--text)">{previewProject.name}</h2>
              <Button onClick={() => setPreviewProject(null)} size="small" variant="ghost">
                <X aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
                Close
              </Button>
            </div>
            <video
              aria-label={`Video preview for ${previewProject.name}`}
              className="aspect-video w-full rounded-(--r-sm) bg-black"
              controls
              src={previewVideoSrc(previewProject)}
            />
          </div>
        </div>
      ) : null}
    </PageChrome>
  );
}

function previewVideoSrc(project: RecentProjectCard): string {
  return project.latest_render_id
    ? `/api/server/projects/${encodeURIComponent(project.project_id)}/render/${encodeURIComponent(project.latest_render_id)}`
    : "";
}
