"use client";

import { KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Project, ProjectConfigLoadResponse } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { EditorBar } from "@/components/editor/EditorBar";
import { EditorModal } from "@/components/editor/EditorModal";
import { Inspector } from "@/components/editor/Inspector";
import { LayersPopover } from "@/components/editor/LayersPopover";
import { PreviewControls } from "@/components/editor/PreviewControls";
import { PreviewSurface } from "@/components/editor/PreviewSurface";
import { RenderStrip } from "@/components/editor/RenderStrip";
import { Timeline } from "@/components/editor/Timeline";
import { TranscriptPane } from "@/components/editor/TranscriptPane";
import type { EditorMediaItem, EditorModal as EditorModalKind, EditorRenderJob, EditorSelection } from "@/components/editor/types";
import { Button } from "@/components/ui";
import { request } from "@/lib/api/server";
import { clearOperationLog, isTextEditingTarget, recoverWorkingState, redoLast, undoLast } from "@/lib/editor-operation-log/operation-log";
import { useProjectAlignment } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

function EditorContent() {
  const t = useTranslations("pages.editor");
  const router = useRouter();
  const params = useSearchParams();
  const requestedProjectId = params.get("projectId") ?? "";
  const projectId = isValidProjectId(requestedProjectId) ? requestedProjectId : "";
  const { state: alignmentState } = useProjectAlignment(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("test01");
  const [projectPath, setProjectPath] = useState("");
  const [audioFile, setAudioFile] = useState("");
  const [hasUnrenderedChanges, setHasUnrenderedChanges] = useState(true);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [media, setMedia] = useState<EditorMediaItem[]>([]);
  const [selected, setSelected] = useState<EditorSelection>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolution, setResolution] = useState("1080p");
  const [fitMode, setFitMode] = useState("fit");
  const [modal, setModal] = useState<EditorModalKind>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [renderJob, setRenderJob] = useState<EditorRenderJob>({ phase: "", progress: 0, running: false, status: "idle" });
  const [assignRange, setAssignRange] = useState<[number, number]>([1, 1]);
  const [saveStatus, setSaveStatus] = useState<"pending" | "saving" | "saved" | "failed">("pending");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedProjectRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const renderSocketRef = useRef<WebSocket | null>(null);

  const sentences = useMemo(() => alignmentState.status === "done" ? alignmentState.result.sentences : [], [alignmentState]);
  const duration = sentences.at(-1)?.end_s ?? 0;
  const visualClipCount = useMemo(() => {
    return layers.reduce((total, layer) => total + (layer.kind === "sub" ? 0 : layer.items.length), 0);
  }, [layers]);
  const cacheLabel = `cache ${visualClipCount}/${visualClipCount}`;
  const activeRange = useMemo<[number, number]>(() => {
    const active = sentences.find((sentence) => currentTime >= sentence.start_s && currentTime < sentence.end_s);
    return active ? [active.index, active.index] : [sentences[0]?.index ?? 1, sentences[0]?.index ?? 1];
  }, [currentTime, sentences]);

  const loadProject = useCallback(async (id: string) => {
    try {
      const [response, mediaItems] = await Promise.all([
        request<ProjectConfigLoadResponse>(`/projects/${encodeURIComponent(id)}/config` as `/${string}`),
        request<EditorMediaItem[]>(`/projects/${encodeURIComponent(id)}/media` as `/${string}`),
      ]);
      const config = response.config;
      const resolvedProjectPath = await resolveProjectPath(id);
      const working = recoverWorkingState(id, {
        layers: (config.layers ?? []) as Layer[],
        output: config.output,
        subtitles: config.subtitles,
        watermark: config.watermark,
      });
      const workingConfig = { ...config, layers: working.layers as Project["layers"], output: working.output, subtitles: working.subtitles, watermark: working.watermark };
      loadedProjectRef.current = true;
      skipAutosaveRef.current = true;
      setProject(workingConfig);
      setProjectName(workingConfig.name ?? id);
      setProjectPath(resolvedProjectPath);
      setAudioFile(workingConfig.audio ?? "");
      setHasUnrenderedChanges(response.has_unrendered_changes);
      setSaveStatus(response.has_unrendered_changes ? "pending" : "saved");
      setLayers(working.layers);
      setMedia(mediaItems);
      const firstSelectable = working.layers.flatMap((layer) => layer.kind === "sub" ? [] : layer.items.map((item) => ({ item, layer }))).find(({ item }) => "id" in item);
      if (firstSelectable && "id" in firstSelectable.item) {
        setSelected({ layerId: firstSelectable.layer.id, itemId: firstSelectable.item.id });
      }
    } catch {
      loadedProjectRef.current = false;
      setProject(null);
      setProjectName(id);
      setProjectPath("");
      setHasUnrenderedChanges(true);
      setSaveStatus("failed");
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    const nextTime = Math.max(0, time);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId);
  }, [loadProject, projectId]);

  useEffect(() => {
    return () => {
      renderSocketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const firstSentence = sentences[0];
    if (firstSentence && currentTime === 0) {
      seekTo(firstSentence.start_s);
    }
  }, [currentTime, seekTo, sentences]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      void audio.play().catch(() => setPlaying(false));
      return;
    }
    audio.pause();
  }, [playing]);

  const seekSentence = useCallback((direction: -1 | 1) => {
    if (sentences.length === 0) return;
    const activeIndex = sentences.findIndex((sentence) => currentTime >= sentence.start_s && currentTime < sentence.end_s);
    const nextIndex = Math.min(sentences.length - 1, Math.max(0, activeIndex + direction));
    seekTo(sentences[nextIndex]?.start_s ?? 0);
  }, [currentTime, seekTo, sentences]);

  const saveNow = useCallback(async () => {
    setSaving(true);
    setSaveStatus("saving");
    try {
      if (!project) return;
      const nextProject: Project = { ...project, layers: layers as Project["layers"] };
      const response = await request<{ has_unrendered_changes: boolean }>(`/projects/${encodeURIComponent(projectId)}/config` as `/${string}`, { method: "PUT", body: { config: nextProject } });
      setProject(nextProject);
      setHasUnrenderedChanges(response.has_unrendered_changes);
      setSaveStatus("saved");
      clearOperationLog(projectId);
    } catch {
      setSaveStatus("failed");
    } finally {
      setSaving(false);
    }
  }, [layers, project, projectId]);

  useEffect(() => {
    if (!projectId || !loadedProjectRef.current) {
      return;
    }
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
    const timeout = window.setTimeout(() => {
      void saveNow();
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [layers, projectId, saveNow]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "z" || isTextEditingTarget(event.target)) return;
      if (!projectId || !project) return;
      event.preventDefault();
      const working = { layers, output: project.output, subtitles: project.subtitles, watermark: project.watermark };
      const result = event.shiftKey ? redoLast(projectId, working) : undoLast(projectId, working);
      setLayers(result.state.layers);
      setProject({ ...project, layers: result.state.layers as Project["layers"], output: result.state.output, subtitles: result.state.subtitles, watermark: result.state.watermark });
      setHasUnrenderedChanges(true);
      setSaveStatus("pending");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layers, project, projectId]);

  const renderDraft = useCallback(async () => {
    if (!hasUnrenderedChanges) return;
    renderSocketRef.current?.close();
    setRenderJob({ phase: "starting", progress: 0, running: true, status: "queued" });
    try {
      const result = await request<{ render_id: string; output_path: string }>(`/projects/${encodeURIComponent(projectId)}/render` as `/${string}`, { method: "POST", body: { preset: "draft" } });
      setRenderJob({
        phase: "queued",
        progress: 0,
        running: true,
        status: "queued",
        outputPath: result.output_path,
        renderId: result.render_id,
      });
      renderSocketRef.current = connectDraftProgress(result.render_id, result.output_path, setRenderJob, () => setHasUnrenderedChanges(false));
    } catch {
      setRenderJob({ phase: "failed", progress: 0, running: false, status: "failed", message: "Render failed to start." });
    }
  }, [hasUnrenderedChanges, projectId]);

  const cancelDraft = useCallback(async () => {
    if (!renderJob.renderId || (renderJob.status !== "queued" && renderJob.status !== "running")) return;
    renderSocketRef.current?.close();
    setRenderJob((job) => ({ ...job, phase: "cancelling", running: true, status: "running" }));
    try {
      await request(`/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(renderJob.renderId)}/cancel` as `/${string}`, { method: "POST" });
      setRenderJob((job) => ({ ...job, phase: "cancelled", progress: 0, running: false, status: "cancelled", message: "Render cancelled." }));
    } catch {
      setRenderJob((job) => ({ ...job, phase: "cancel failed", running: false, status: "failed", message: "Render cancel failed." }));
    }
  }, [projectId, renderJob.renderId, renderJob.status]);

  const renderFinal = useCallback(async () => {
    try {
      if (!hasUnrenderedChanges) return;
      const result = await request<{ render_id: string }>(`/projects/${encodeURIComponent(projectId)}/render` as `/${string}`, { method: "POST", body: { preset: "final" } });
      router.push(`/render?projectId=${encodeURIComponent(projectId)}&job=${encodeURIComponent(result.render_id)}`);
      return;
    } catch {
      // Render screen shows final status.
    }
    router.push(`/render?projectId=${encodeURIComponent(projectId)}`);
  }, [hasUnrenderedChanges, projectId, router]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return sentences.filter((sentence) => sentence.text.toLowerCase().includes(normalized) || `s${sentence.index}`.includes(normalized));
  }, [query, sentences]);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setCurrentMatch(0);
    } else if (event.key === "Enter" && matches.length > 0) {
      event.preventDefault();
      const next = (currentMatch + (event.shiftKey ? -1 : 1) + matches.length) % matches.length;
      setCurrentMatch(next);
      const match = matches[next];
      if (match) {
        seekTo(match.start_s);
      }
    }
  }

  if (!projectId) {
    return (
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">{t("noProject")}</p>
        <Button onClick={() => router.push("/")} variant="primary">{t("goLauncher")}</Button>
      </PageChrome>
    );
  }

  return (
    <PageChrome className="grid h-[calc(100vh-44px-40px)] grid-rows-[48px_auto_1fr] overflow-hidden">
      <EditorBar
        cacheLabel={cacheLabel}
        onHome={() => router.push("/")}
        onRenderDraft={renderDraft}
        onRenderFinal={renderFinal}
        onSave={() => void saveNow()}
        projectName={projectName}
        projectId={projectId}
        renderJob={renderJob}
        renderDisabled={!hasUnrenderedChanges}
        saveStatus={saveStatus}
          saving={saving}
        />
      <RenderStrip job={renderJob} onCancel={cancelDraft} />
      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_320px] divide-x divide-(--line) bg-(--line)">
        <TranscriptPane
          activeRange={activeRange}
          currentMatch={currentMatch}
          onAssign={(index) => {
            seekTo(sentences.find((sentence) => sentence.index === index)?.start_s ?? currentTime);
            setAssignRange([index, index]);
            setModal("upload");
          }}
          onQueryChange={(value) => {
            setQuery(value);
            setCurrentMatch(0);
            const first = sentences.find((sentence) => sentence.text.toLowerCase().includes(value.toLowerCase()));
            if (first && value.trim()) seekTo(first.start_s);
          }}
          onSearchKeyDown={onSearchKeyDown}
          onSeek={seekTo}
          query={query}
          searchInputRef={searchInputRef}
          sentences={sentences}
        />
        <main className="flex min-w-0 flex-col bg-(--bg-0)">
          <PreviewSurface
            currentTime={currentTime}
            duration={duration}
            layers={layers}
            onNext={() => seekSentence(1)}
            onPrevious={() => seekSentence(-1)}
            onTogglePlay={() => setPlaying((value) => !value)}
            playing={playing}
            projectPath={projectPath}
            fitMode={fitMode}
            resolution={resolution}
            sentences={sentences}
          />
          <div className="relative">
            <PreviewControls
              fitMode={fitMode}
              layerCount={layers.length}
              onLayers={() => setLayersOpen((value) => !value)}
              onSetFitMode={setFitMode}
              onSetResolution={setResolution}
              resolution={resolution}
            />
            <LayersPopover layers={layers} onAdd={() => setModal("upload")} open={layersOpen} />
          </div>
          <Timeline cacheLabel={cacheLabel} currentTime={currentTime} duration={duration} fps={30} layers={layers} onSeek={seekTo} onSelect={setSelected} selected={selected} />
        </main>
        <Inspector layers={layers} media={media} onOpenBackground={() => setModal("background")} onOpenUpload={() => setModal("upload")} projectPath={projectPath} selected={selected} />
      </div>
      {audioFile && projectPath ? (
        <audio
          data-testid="editor-audio"
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          preload="metadata"
          ref={audioRef}
          src={`/api/server/projects/audio?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(audioFile)}`}
        />
      ) : null}
      <EditorModal assignRange={assignRange} media={media} modal={modal} onClose={() => setModal(null)} projectPath={projectPath} />
    </PageChrome>
  );
}

async function resolveProjectPath(projectId: string): Promise<string> {
  try {
    const projects = await request<Array<{ project_id: string; path: string }>>("/projects");
    return projects.find((project) => project.project_id === projectId)?.path ?? "";
  } catch {
    return "";
  }
}

function isValidProjectId(value: string): boolean {
  return /^p_[A-Za-z0-9_-]+$/.test(value);
}

type DraftProgressEvent = {
  type: "progress";
  render_id: string;
  stage: "cache_warm" | "compose" | "muxing" | "done" | "error" | "cancelled";
  percent: number;
  message?: string;
  output_path?: string;
};

function connectDraftProgress(renderId: string, outputPath: string, setRenderJob: Dispatch<SetStateAction<EditorRenderJob>>, onReady: () => void): WebSocket {
  const socket = new WebSocket(renderWsUrl(renderId));
  socket.onmessage = (message) => {
    const event = parseProgressEvent(message.data);
    if (!event) return;
    if (event.stage === "done") {
      onReady();
      setRenderJob({
        phase: "ready",
        progress: 100,
        running: false,
        status: "ready",
        message: event.message,
        outputPath: event.output_path ?? outputPath,
        renderId,
      });
      socket.close();
      return;
    }
    if (event.stage === "error") {
      setRenderJob({
        phase: "failed",
        progress: event.percent,
        running: false,
        status: "failed",
        message: event.message,
        outputPath,
        renderId,
      });
      socket.close();
      return;
    }
    if (event.stage === "cancelled") {
      setRenderJob({
        phase: "cancelled",
        progress: 0,
        running: false,
        status: "cancelled",
        message: event.message,
        outputPath,
        renderId,
      });
      socket.close();
      return;
    }
    setRenderJob({
      phase: event.stage,
      progress: event.percent,
      running: true,
      status: "running",
      message: event.message,
      outputPath,
      renderId,
    });
  };
  socket.onerror = () => {
    setRenderJob({
      phase: "connection failed",
      progress: 0,
      running: false,
      status: "failed",
      message: "Render progress connection failed.",
      outputPath,
      renderId,
    });
  };
  return socket;
}

function parseProgressEvent(data: unknown): DraftProgressEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as Partial<DraftProgressEvent>;
    if (value.type !== "progress" || !value.render_id || !value.stage || typeof value.percent !== "number") return null;
    return value as DraftProgressEvent;
  } catch {
    return null;
  }
}

function renderWsUrl(renderId: string): string {
  const query = new URLSearchParams({ render_id: renderId });
  const configured = process.env.NEXT_PUBLIC_SERVER_WS_URL;
  if (configured) {
    return `${configured.replace(/\/$/, "")}/projects/render/ws?${query.toString()}`;
  }
  if (typeof window === "undefined") {
    return `/projects/render/ws?${query.toString()}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/server/projects/render/ws?${query.toString()}`;
}

export default function EditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}
