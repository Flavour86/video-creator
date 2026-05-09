"use client";

import { FolderOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RecentProject } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { ProjectCard } from "@/components/launcher/ProjectCard";
import { RuntimeCard } from "@/components/launcher/RuntimeCard";
import { TipsCard } from "@/components/launcher/TipsCard";
import { Button } from "@/components/ui";
import { request } from "@/lib/api/server";

function isTransientTestProject(project: RecentProject): boolean {
  const normalizedPath = project.path.toLowerCase();

  return (
    normalizedPath.includes("\\appdata\\local\\temp\\") ||
    normalizedPath.includes("/appdata/local/temp/") ||
    normalizedPath.includes("pytest-of-") ||
    normalizedPath.includes(".ctx-mode-")
  );
}

function presentableProjects(projects: RecentProject[]): RecentProject[] {
  return projects.filter((project) => !isTransientTestProject(project));
}

export default function LauncherPage() {
  const t = useTranslations("pages.launcher");
  const router = useRouter();
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [recentError, setRecentError] = useState(false);

  useEffect(() => {
    async function loadRecent() {
      try {
        const recent = await request<RecentProject[]>("/projects/recent");
        setProjects(presentableProjects(recent));
        setRecentError(false);
      } catch {
        setProjects([]);
        setRecentError(true);
      }
    }

    void loadRecent();
  }, []);

  async function openProject(project: RecentProject) {
    try {
      await request<RecentProject>("/projects/open", { method: "POST", body: { path: project.path } });
      router.push(`/editor?project=${encodeURIComponent(project.path)}`);
    } catch {
      router.push(`/setup?path=${encodeURIComponent(project.path)}`);
    }
  }

  function goSetup() {
    router.push("/setup");
  }

  return (
    <PageChrome className="mx-auto grid max-w-350 grid-cols-[minmax(0,1fr)_360px] gap-4.5 p-(--space-9)">
      <header className="col-span-full mb-4.5 flex items-end justify-between gap-(--space-7)">
        <div className="whitespace-nowrap">
          <p className="vc-type-eyebrow mb-(--space-2) text-(--text-3)">{t("eyebrow")}</p>
          <h1 className="vc-type-display">{t("title")}</h1>
        </div>
        <div className="flex gap-(--space-3)">
          <Button onClick={goSetup} variant="ghost">
            <FolderOpen aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
            {t("openFolder")}
          </Button>
          <Button onClick={goSetup} variant="primary">
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
        {projects.map((project) => (
          <ProjectCard key={project.path} onClick={() => void openProject(project)} project={project} />
        ))}
        <ProjectCard onClick={goSetup} variant="empty" />
      </section>
      <aside className="flex flex-col gap-(--space-6)">
        <RuntimeCard />
        <TipsCard />
      </aside>
    </PageChrome>
  );
}
