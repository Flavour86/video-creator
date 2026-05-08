"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { Button } from "@/components/ui";

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
      <header className="flex flex-wrap items-center justify-between gap-(--space-5)">
        <div>
          <h1 className="vc-type-display text-(--text)">Video Creator</h1>
          <p className="vc-type-body mt-(--space-1) text-(--text-2)">Recent local projects</p>
        </div>
        <Link
          className="vc-type-body inline-flex h-(--space-10) items-center justify-center rounded-(--r) border border-transparent bg-(--blue) px-(--space-5) font-semibold text-(--text) transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
          href="/projects/new"
        >
          New Project
        </Link>
      </header>

      {isLoading ? <p className="vc-type-body text-(--text-2)">Loading...</p> : null}

      {!isLoading && projects.length === 0 ? (
        <section className="vc-drop-zone flex min-h-80 items-center justify-center rounded-(--r)">
          <p className="vc-type-body text-(--text-2)">No projects yet - create one to get started.</p>
        </section>
      ) : null}

      <section className="grid gap-(--space-3)">
        {projects.map((project) => (
          <article
            className="grid gap-(--space-4) rounded-(--r) border border-(--line) bg-(--bg-1) p-(--space-5) sm:grid-cols-[96px_1fr_auto]"
            key={project.path}
          >
            <div className="aspect-video rounded-(--r-sm) bg-(--bg-3)" />
            <button
              className="rounded-(--r-sm) text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
              onClick={() => void openProject(project)}
              type="button"
            >
              <h2 className="vc-type-section text-(--text)">{project.name}</h2>
              <p className="vc-type-mono-meta mt-(--space-1) break-all text-(--text-3)">{project.path}</p>
              <p className="vc-type-caption mt-(--space-3) text-(--text-3)">
                Voice {project.voice_duration || "--"} - {project.sentence_count} sentences -{" "}
                {project.media_count} media - {project.last_opened_at}
              </p>
              {errorByPath[project.path] ? (
                <p className="vc-type-body mt-(--space-2) text-(--red)">{errorByPath[project.path]}</p>
              ) : null}
            </button>
            {errorByPath[project.path] ? (
              <Button onClick={() => void removeProject(project)} size="extra-small" variant="danger">
                Remove
              </Button>
            ) : null}
          </article>
        ))}
      </section>
    </PageChrome>
  );
}
