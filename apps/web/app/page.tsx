"use client";

import { FolderOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { RecentProject } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { ProjectCard } from "@/components/launcher/ProjectCard";
import { RuntimeCard } from "@/components/launcher/RuntimeCard";
import { TipsCard } from "@/components/launcher/TipsCard";
import { Button, Field, TextInput } from "@/components/ui";
import { request, ServerRequestError } from "@/lib/api/server";

type FolderPickerState = "idle" | "selecting" | "creating" | "cancelled" | "error";

type ProjectCreateResponse = {
  path: string;
  name: string;
};

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
  const [pickerState, setPickerState] = useState<FolderPickerState>("idle");
  const [folderPath, setFolderPath] = useState("");
  const [folderError, setFolderError] = useState("");
  const projectName = useMemo(() => nameFromPath(folderPath), [folderPath]);

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

  function startFolderSelection() {
    setPickerState("selecting");
    setFolderError("");
  }

  function cancelFolderSelection() {
    setPickerState("cancelled");
    setFolderError("Folder selection cancelled.");
  }

  async function createSelectedFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPath = folderPath.trim();
    if (!selectedPath) {
      setPickerState("error");
      setFolderError("Choose a folder before continuing.");
      return;
    }

    setPickerState("creating");
    setFolderError("");
    try {
      const created = await request<ProjectCreateResponse>("/projects/new-folder", {
        method: "POST",
        body: { path: selectedPath, name: projectName || "Untitled Project" },
      });
      router.push(`/setup?path=${encodeURIComponent(created.path)}`);
    } catch (error) {
      setPickerState("error");
      setFolderError(folderPickerError(error));
    }
  }

  return (
    <PageChrome className="mx-auto grid max-w-350 grid-cols-[minmax(0,1fr)_360px] gap-4.5 p-(--space-9)">
      <header className="col-span-full mb-4.5 flex items-end justify-between gap-(--space-7)">
        <div className="whitespace-nowrap">
          <p className="vc-type-eyebrow mb-(--space-2) text-(--text-3)">{t("eyebrow")}</p>
          <h1 className="vc-type-display">{t("title")}</h1>
        </div>
        <div className="flex gap-(--space-3)">
          <Button onClick={startFolderSelection} variant="ghost">
            <FolderOpen aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
            {t("openFolder")}
          </Button>
          <Button onClick={startFolderSelection} variant="primary">
            <Plus aria-hidden="true" className="h-(--space-4) w-(--space-4)" />
            {t("newProject")}
          </Button>
        </div>
      </header>
      <section className="space-y-2.5">
        {pickerState !== "idle" ? (
          <form
            aria-label="Choose a local folder"
            className="space-y-(--space-4) rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-6)"
            onSubmit={(event) => void createSelectedFolder(event)}
          >
            <Field label="Folder path">
              <TextInput
                aria-label="Folder path"
                autoFocus
                onChange={(event) => setFolderPath(event.target.value)}
                placeholder="E:\\video-projects\\new-project"
                value={folderPath}
              />
            </Field>
            {folderError ? (
              <div
                className="rounded-(--r-sm) border border-(--amber-line) bg-(--amber-bg) px-(--space-4) py-(--space-3) text-xs text-(--text-2)"
                role="status"
              >
                {folderError}
              </div>
            ) : null}
            <div className="flex justify-end gap-(--space-3)">
              <Button onClick={cancelFolderSelection} variant="ghost">
                Cancel
              </Button>
              <Button disabled={pickerState === "creating"} type="submit" variant="primary">
                {pickerState === "creating" ? "Creating" : "Create project"}
              </Button>
            </div>
          </form>
        ) : null}
        {recentError ? (
          <div className="rounded-(--r) border border-(--amber-line) bg-(--amber-bg) px-(--space-5) py-(--space-4) text-xs text-(--text-2)">
            {t("recentUnavailable")}
          </div>
        ) : null}
        {projects.map((project) => (
          <ProjectCard key={project.path} onClick={() => void openProject(project)} project={project} />
        ))}
        <ProjectCard onClick={startFolderSelection} variant="empty" />
      </section>
      <aside className="flex flex-col gap-(--space-6)">
        <RuntimeCard />
        <TipsCard />
      </aside>
    </PageChrome>
  );
}

function nameFromPath(path: string): string {
  return path.trim().split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function folderPickerError(error: unknown): string {
  if (!(error instanceof ServerRequestError)) {
    return "Folder could not be selected.";
  }
  const code = errorCode(error.payload);
  if (code === "NOT_EMPTY") {
    return "Folder is not empty.";
  }
  if (code === "INVALID_PATH") {
    return "Folder path is invalid.";
  }
  if (code === "PERMISSION_DENIED") {
    return "Folder permission denied.";
  }
  return "Folder could not be selected.";
}

function errorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return "";
  }
  const error = payload.error;
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "";
  }
  return typeof error.code === "string" ? error.code : "";
}
