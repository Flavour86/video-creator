"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageChrome } from "@/components/app-shell/PageChrome";

type RecentProject = {
  path: string;
  name: string;
  last_opened_at: string;
  voice_duration: string;
  sentence_count: number;
  media_count: number;
};

export default function LauncherPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadRecent() {
      const response = await fetch("/api/server/projects/recent");
      setProjects(response.ok ? await response.json() : []);
      setIsLoading(false);
    }

    void loadRecent();
  }, []);

  async function openProject(project: RecentProject) {
    const response = await fetch("/api/server/projects/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: project.path }),
    });
    if (!response.ok) {
      setErrorByPath((current) => ({ ...current, [project.path]: "Folder missing" }));
      return;
    }
    router.push(`/editor?project=${encodeURIComponent(project.path)}`);
  }

  async function removeProject(project: RecentProject) {
    await fetch("/api/server/projects/recent", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: project.path }),
    });
    setProjects((current) => current.filter((item) => item.path !== project.path));
  }

  return (
    <PageChrome>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Video Creator</h1>
          <p className="mt-1 text-sm opacity-70">Recent local projects</p>
        </div>
        <Link className="rounded bg-neutral-950 px-4 py-2 text-sm font-semibold text-white" href="/projects/new">
          New Project
        </Link>
      </header>

      {isLoading ? <p className="text-sm opacity-70">Loading...</p> : null}

      {!isLoading && projects.length === 0 ? (
        <section className="flex min-h-80 items-center justify-center rounded border border-dashed border-neutral-300">
          <p className="text-sm opacity-70">No projects yet - create one to get started.</p>
        </section>
      ) : null}

      <section className="grid gap-3">
        {projects.map((project) => (
          <article
            className="grid gap-4 rounded border border-neutral-200 p-4 sm:grid-cols-[96px_1fr_auto]"
            key={project.path}
          >
            <div className="aspect-video rounded bg-neutral-200" />
            <button className="text-left" onClick={() => void openProject(project)} type="button">
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="mt-1 break-all font-mono text-xs opacity-70">{project.path}</p>
              <p className="mt-3 text-xs opacity-70">
                Voice {project.voice_duration || "--"} · {project.sentence_count} sentences ·{" "}
                {project.media_count} media · {project.last_opened_at}
              </p>
              {errorByPath[project.path] ? (
                <p className="mt-2 text-sm text-red-600">{errorByPath[project.path]}</p>
              ) : null}
            </button>
            {errorByPath[project.path] ? (
              <button className="text-sm font-medium text-red-700" onClick={() => void removeProject(project)} type="button">
                Remove
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </PageChrome>
  );
}
