"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { RecentProjectCard } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { ProjectCard } from "@/components/launcher/ProjectCard";
import { Button, Field, TextInput } from "@/components/ui";
import { request, ServerRequestError } from "@/lib/api/server";

type FolderPickerState = "idle" | "selecting" | "creating" | "cancelled" | "error";

type ProjectCreateResponse = {
  project_id: string;
  path: string;
  name: string;
};

export default function LauncherPage() {
  const t = useTranslations("pages.launcher");
  const router = useRouter();
  const [projects, setProjects] = useState<RecentProjectCard[]>([]);
  const [recentError, setRecentError] = useState(false);
  const [pickerState, setPickerState] = useState<FolderPickerState>("idle");
  const [folderPath, setFolderPath] = useState("");
  const [folderError, setFolderError] = useState("");
  const projectName = useMemo(() => nameFromPath(folderPath), [folderPath]);

  useEffect(() => {
    async function loadRecent() {
      try {
        const recent = await request<RecentProjectCard[]>("/projects");
        setProjects(recent);
        setRecentError(false);
      } catch {
        setProjects([]);
        setRecentError(true);
      }
    }

    void loadRecent();
  }, []);

  function openProject(project: RecentProjectCard) {
    if (project.alignment_state === "aligned" && project.status === "ready") {
      router.push(`/editor?projectId=${encodeURIComponent(project.project_id)}`);
      return;
    }
    router.push(`/setup?projectId=${encodeURIComponent(project.project_id)}`);
  }

  async function playLatestRender(project: RecentProjectCard) {
    if (!project.latest_render_id) {
      return;
    }
    await request(`/projects/${encodeURIComponent(project.project_id)}/renders/${encodeURIComponent(project.latest_render_id)}/play`, {
      method: "POST",
    });
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
      if (!created.project_id) {
        throw new Error("Missing project id");
      }
      router.push(`/setup?projectId=${encodeURIComponent(created.project_id)}&path=${encodeURIComponent(created.path)}`);
    } catch (error) {
      setPickerState("error");
      setFolderError(folderPickerError(error));
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
        {projects.length === 0 && !recentError ? (
          <div className="rounded-(--r) border border-dashed border-(--line) bg-(--bg-2) px-(--space-6) py-(--space-8) text-center text-sm text-(--text-3)">
            No projects yet.
          </div>
        ) : null}
        {projects.map((project) => (
          <ProjectCard
            key={project.project_id}
            onClick={() => openProject(project)}
            onPlayLatest={() => void playLatestRender(project)}
            project={project}
          />
        ))}
      </section>
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
