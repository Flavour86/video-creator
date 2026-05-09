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

const sampleProjects: RecentProject[] = [
  {
    name: "Tokyo Essay",
    path: "E:\\video-projects\\tokyo-essay",
    voice_duration: "15:42",
    sentence_count: 164,
    media_count: 38,
    last_opened_at: "2 hours ago",
    alignment_state: "aligned",
    palette_seed: "night",
  },
  {
    name: "Camera Test Script",
    path: "E:\\video-projects\\camera-test",
    voice_duration: "03:28",
    sentence_count: 29,
    media_count: 7,
    last_opened_at: "Yesterday",
    alignment_state: "aligned",
    palette_seed: "warm",
  },
  {
    name: "Lighting Notes",
    path: "D:\\renders\\lighting-notes",
    voice_duration: "08:05",
    sentence_count: 72,
    media_count: 18,
    last_opened_at: "3 days ago",
    alignment_state: "aligned",
    palette_seed: "cool",
  },
  {
    name: "Shibuya at Night",
    path: "E:\\video-projects\\shibuya-night",
    voice_duration: "12:11",
    sentence_count: 121,
    media_count: 24,
    last_opened_at: "Last week",
    alignment_state: "aligned",
    palette_seed: "olive",
  },
];

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
  const stableProjects = projects.filter((project) => !isTransientTestProject(project));

  return stableProjects.length > 0 ? stableProjects : sampleProjects;
}

export default function LauncherPage() {
  const t = useTranslations("pages.launcher");
  const router = useRouter();
  const [projects, setProjects] = useState<RecentProject[]>(sampleProjects);

  useEffect(() => {
    async function loadRecent() {
      try {
        const recent = await request<RecentProject[]>("/projects/recent");
        setProjects(presentableProjects(recent));
      } catch {
        setProjects(sampleProjects);
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
