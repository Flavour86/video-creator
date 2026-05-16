"use client";

import { KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Project, ProjectConfigLoadResponse, ProjectConfigSaveResponse } from "@vc/shared-schemas";
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
import {
  appendOperation,
  buildWorkingConfig,
  clearOperationLog,
  ensureOperationLog,
  isValidProjectSaveConfig,
  loadOperationLog,
  loadRecoveryState,
  recoverWorkingState,
  redoLast,
  saveRecoveryState,
  undoLast,
  type EditorRecoverySelection,
} from "@/lib/editor-operation-log/operation-log";
import { type AlignedSentence, useProjectAlignment } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";

function projectIdFromPathname(pathname: string): string {
  const prefix = "/editor/";
  if (!pathname.startsWith(prefix)) {
    return "";
  }
  const segment = pathname.slice(prefix.length).split("/")[0] ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function EditorContent() {
  const t = useTranslations("pages.editor");
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const requestedProjectId = params.get("projectId") || projectIdFromPathname(pathname);
  const projectId = isValidProjectId(requestedProjectId) ? requestedProjectId : "";
  const { state: alignmentState } = useProjectAlignment(projectId);
  const [canonicalProject, setCanonicalProject] = useState<Project | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("test01");
  const [projectPath, setProjectPath] = useState("");
  const [audioFile, setAudioFile] = useState("");
  const [hasUnrenderedChanges, setHasUnrenderedChanges] = useState(true);
  const [latestConfigHash, setLatestConfigHash] = useState<string | null>(null);
  const [lastRenderedConfigHash, setLastRenderedConfigHash] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [media, setMedia] = useState<EditorMediaItem[]>([]);
  const [selected, setSelected] = useState<EditorSelection>(null);
  const [selectedSentenceRange, setSelectedSentenceRange] = useState<[number, number] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolution, setResolution] = useState("1080p");
  const [modal, setModal] = useState<EditorModalKind>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [renderJob, setRenderJob] = useState<EditorRenderJob>({ phase: "", progress: 0, running: false, status: "idle" });
  const [assignRange, setAssignRange] = useState<[number, number]>([1, 1]);
  const [saveStatus, setSaveStatus] = useState<"pending" | "saving" | "saved" | "failed">("pending");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number>(0);
  const pendingSelectedRangeRef = useRef<[number, number] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedProjectRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const renderSocketRef = useRef<WebSocket | null>(null);

  const alignmentSentences = useMemo(() => alignmentState.status === "done" ? alignmentState.result.sentences : [], [alignmentState]);
  const [sentences, setSentences] = useState<AlignedSentence[]>([]);
  const duration = sentences.at(-1)?.end_s ?? 0;
  const visualClipCount = useMemo(() => {
    return layers.reduce((total, layer) => total + (layer.kind === "sub" ? 0 : layer.items.length), 0);
  }, [layers]);
  const cacheLabel = `cache ${visualClipCount}/${visualClipCount}`;
  const activeRange = useMemo<[number, number]>(() => {
    const active = sentences.find((sentence) => currentTime >= sentence.start_s && currentTime < sentence.end_s);
    return active ? [active.index, active.index] : [sentences[0]?.index ?? 1, sentences[0]?.index ?? 1];
  }, [currentTime, sentences]);
  const renderHashDiffers = useMemo(() => {
    if (!lastRenderedConfigHash) return true;
    if (hasUnrenderedChanges) return true;
    if (!latestConfigHash) return false;
    return latestConfigHash !== lastRenderedConfigHash;
  }, [hasUnrenderedChanges, lastRenderedConfigHash, latestConfigHash]);
  const renderDisabled = saving || renderJob.running || !project || !renderHashDiffers;

  const loadProject = useCallback(async (id: string) => {
    try {
      const [response, mediaItems] = await Promise.all([
        request<ProjectConfigLoadResponse>(`/projects/${encodeURIComponent(id)}/config` as `/${string}`),
        request<EditorMediaItem[]>(`/projects/${encodeURIComponent(id)}/media` as `/${string}`),
      ]);
      const config = response.config;
      const resolvedProjectPath = await resolveProjectPath(id);
      const recoveryState = loadRecoveryState(id);
      const operationLog = loadOperationLog(id);
      const working = recoverWorkingState(id, {
        layers: (config.layers ?? []) as Layer[],
        transcript: config.transcript,
        output: config.output,
        subtitles: config.subtitles,
        watermark: config.watermark,
      });
      const workingConfig = {
        ...config,
        layers: working.layers as Project["layers"],
        transcript: working.transcript,
        output: working.output,
        subtitles: working.subtitles,
        watermark: working.watermark,
      };
      const selected = selectRecoverySelection(recoveryState?.selected ?? null, working.layers);
      loadedProjectRef.current = true;
      skipAutosaveRef.current = true;
      pendingScrollTopRef.current = recoveryState?.transcriptScrollTop ?? 0;
      pendingSelectedRangeRef.current = recoveryState?.selectedRange ?? null;
      setCanonicalProject(config);
      setProject(workingConfig);
      setProjectName(workingConfig.name ?? id);
      setProjectPath(resolvedProjectPath);
      setAudioFile(workingConfig.audio ?? "");
      const dirty = response.has_unrendered_changes || operationLog.undo.length > 0;
      setHasUnrenderedChanges(dirty);
      setLatestConfigHash(response.config_hash);
      setLastRenderedConfigHash(response.last_rendered_config_hash ?? null);
      setSaveStatus(dirty ? "pending" : "saved");
      setLayers(working.layers);
      setMedia(mediaItems);
      setSelected(selected);
      setResolution(normalizeResolutionPreset(recoveryState?.resolution, config.output?.resolution));
    } catch {
      loadedProjectRef.current = false;
      setCanonicalProject(null);
      setProject(null);
      setProjectName(id);
      setProjectPath("");
      setLayers([]);
      setMedia([]);
      setSelected(null);
      setSelectedSentenceRange(null);
      setResolution("1080p");
      setLatestConfigHash(null);
      setLastRenderedConfigHash(null);
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
    const transcriptSentences = sanitizeTranscriptSentences(project?.transcript);
    setSentences(transcriptSentences.length > 0 ? transcriptSentences : alignmentSentences);
    if (pendingSelectedRangeRef.current) {
      setSelectedSentenceRange(pendingSelectedRangeRef.current);
      pendingSelectedRangeRef.current = null;
    }
  }, [alignmentSentences, project?.transcript]);

  useEffect(() => {
    const container = transcriptScrollRef.current;
    if (!container) return;
    const top = pendingScrollTopRef.current;
    if (top <= 0) return;
    container.scrollTop = top;
    pendingScrollTopRef.current = 0;
  }, [sentences]);

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

  const saveNow = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    setSaveStatus("saving");
    try {
      if (!canonicalProject || !project) {
        setSaveStatus("failed");
        return null;
      }
      const replayedProject = buildWorkingConfig(canonicalProject, projectId);
      const nextProject: Project = {
        ...replayedProject,
        layers: layers as Project["layers"],
        transcript: project.transcript,
        output: project.output,
        subtitles: project.subtitles,
        watermark: project.watermark,
      };
      if (!isValidProjectSaveConfig(nextProject)) {
        setSaveStatus("failed");
        return null;
      }
      const response = await request<ProjectConfigSaveResponse>(`/projects/${encodeURIComponent(projectId)}/config` as `/${string}`, {
        method: "PUT",
        body: { config: nextProject },
      });
      setCanonicalProject(nextProject);
      setProject(nextProject);
      setLayers((nextProject.layers ?? []) as Layer[]);
      setLatestConfigHash(response.config_hash);
      setHasUnrenderedChanges(response.has_unrendered_changes);
      setSaveStatus("saved");
      clearOperationLog(projectId);
      return response.config_hash;
    } catch {
      setSaveStatus("failed");
      return null;
    } finally {
      setSaving(false);
    }
  }, [canonicalProject, layers, project, projectId]);

  useEffect(() => {
    if (!projectId || !project || !loadedProjectRef.current) {
      return;
    }
    if (skipAutosaveRef.current) {
      return;
    }
    ensureOperationLog(projectId);
    saveRecoveryState(projectId, {
      version: 1,
      resolution: normalizeResolutionPreset(resolution),
      selected: selected as EditorRecoverySelection,
      selectedRange: selectedSentenceRange,
      transcriptScrollTop: Math.max(0, transcriptScrollRef.current?.scrollTop ?? 0),
    });
  }, [layers, project, projectId, resolution, selected, selectedSentenceRange]);

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
  }, [layers, projectId]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "z" || isTextEditingTarget(event.target)) return;
      if (!projectId || !project) return;
      event.preventDefault();
      const working = { layers, transcript: project.transcript, output: project.output, subtitles: project.subtitles, watermark: project.watermark };
      const result = event.shiftKey ? redoLast(projectId, working) : undoLast(projectId, working);
      setLayers(result.state.layers);
      setProject({
        ...project,
        layers: result.state.layers as Project["layers"],
        transcript: result.state.transcript,
        output: result.state.output,
        subtitles: result.state.subtitles,
        watermark: result.state.watermark,
      });
      const transcriptSentences = sanitizeTranscriptSentences(result.state.transcript);
      setSentences(transcriptSentences.length > 0 ? transcriptSentences : alignmentSentences);
      setResolution(normalizeResolutionPreset(result.state.output?.resolution, resolution));
      setHasUnrenderedChanges(true);
      setSaveStatus("pending");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alignmentSentences, layers, project, projectId, resolution]);

  const renderDraft = useCallback(async () => {
    if (!projectId || !project || renderDisabled) return;
    const savedConfigHash = await saveNow();
    if (!savedConfigHash) return;
    renderSocketRef.current?.close();
    setRenderJob({ phase: "queued", progress: 0, running: true, status: "queued" });
    try {
      const result = await request<{ render_id: string; output_path: string }>(
        renderQueuePath(projectId, "draft", resolution),
        { method: "POST" },
      );
      setRenderJob({
        phase: "queued",
        progress: 0,
        running: true,
        status: "queued",
        outputPath: result.output_path,
        renderId: result.render_id,
      });
      renderSocketRef.current = connectDraftProgress(projectId, result.render_id, result.output_path, setRenderJob, () => {
        setHasUnrenderedChanges(false);
        setLatestConfigHash(savedConfigHash);
        setLastRenderedConfigHash(savedConfigHash);
      });
    } catch {
      setRenderJob({ phase: "failed", progress: 0, running: false, status: "failed", message: "Render failed to start." });
    }
  }, [project, projectId, renderDisabled, resolution, saveNow]);

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
    if (!projectId || !project || renderDisabled) return;
    const savedConfigHash = await saveNow();
    if (!savedConfigHash) return;
    try {
      const result = await request<{ render_id: string }>(
        renderQueuePath(projectId, "final", resolution),
        { method: "POST" },
      );
      setLatestConfigHash(savedConfigHash);
      router.push(`/render/${encodeURIComponent(projectId)}/${encodeURIComponent(result.render_id)}` as Parameters<typeof router.push>[0]);
      return;
    } catch {
      // Render screen shows final status.
    }
    router.push(`/render?projectId=${encodeURIComponent(projectId)}` as Parameters<typeof router.push>[0]);
  }, [project, projectId, renderDisabled, resolution, router, saveNow]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return sentences.filter((sentence) => sentence.text.toLowerCase().includes(normalized) || `s${sentence.index}`.includes(normalized));
  }, [query, sentences]);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setCurrentMatch(0);
    } else if ((event.key === "Enter" || event.key === "ArrowDown") && matches.length > 0) {
      event.preventDefault();
      const next = (currentMatch + (event.shiftKey && event.key === "Enter" ? -1 : 1) + matches.length) % matches.length;
      setCurrentMatch(next);
      const match = matches[next];
      if (match) {
        seekTo(match.start_s);
      }
    }
  }

  const assignSentenceRange = useCallback((range: [number, number]) => {
    setAssignRange(range);
    setSelectedSentenceRange(range);
    setModal("upload");
  }, []);

  const playFromSentence = useCallback((index: number) => {
    const sentence = sentences.find((item) => item.index === index);
    if (!sentence) return;
    seekTo(sentence.start_s);
    setPlaying(true);
  }, [seekTo, sentences]);

  const mergeSentenceWithNext = useCallback((range: [number, number]) => {
    if (!project) return;
    const mergeResult = mergeSentences(sentences, range);
    if (!mergeResult) return;
    const nextLayers = remapLayersAfterSentenceMerge(layers, mergeResult.range, mergeResult.sentences);
    const nextTranscript: Project["transcript"] = {
      ...project.transcript,
      sentences: mergeResult.sentences,
    };
    setSentences(mergeResult.sentences);
    setLayers(nextLayers);
    setProject({ ...project, layers: nextLayers as Project["layers"], transcript: nextTranscript });
    if (projectId) {
      appendOperation(projectId, {
        type: "transcript_merge",
        before: { layers, transcript: project.transcript },
        after: { layers: nextLayers, transcript: nextTranscript },
      });
    }
    setSelectedSentenceRange([mergeResult.range[0], mergeResult.range[0]]);
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [layers, project, projectId, sentences]);

  const onResolutionChange = useCallback((value: string) => {
    const nextResolution = normalizeResolutionPreset(value, resolution);
    setResolution(nextResolution);
    if (!projectId || !project || project.output.resolution === nextResolution) return;
    const nextOutput = { ...project.output, resolution: nextResolution };
    appendOperation(projectId, {
      type: "global_config_update",
      before: project.output,
      after: nextOutput,
    });
    setProject({ ...project, output: nextOutput });
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [project, projectId, resolution]);

  const onTranscriptScroll = useCallback((scrollTop: number) => {
    if (!projectId || !project || !loadedProjectRef.current || skipAutosaveRef.current) return;
    ensureOperationLog(projectId);
    saveRecoveryState(projectId, {
      version: 1,
      resolution: normalizeResolutionPreset(resolution),
      selected: selected as EditorRecoverySelection,
      selectedRange: selectedSentenceRange,
      transcriptScrollTop: Math.max(0, scrollTop),
    });
  }, [project, projectId, resolution, selected, selectedSentenceRange]);

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
        renderDisabled={renderDisabled}
        saveStatus={saveStatus}
        saving={saving}
      />
      <RenderStrip job={renderJob} onCancel={cancelDraft} />
      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_320px] divide-x divide-(--line) bg-(--line)">
        <TranscriptPane
          activeRange={activeRange}
          currentMatch={currentMatch}
          onAssignRange={assignSentenceRange}
          onMergeRange={mergeSentenceWithNext}
          onPlayFrom={playFromSentence}
          onQueryChange={(value) => {
            setQuery(value);
            setCurrentMatch(0);
            const first = sentences.find((sentence) => sentence.text.toLowerCase().includes(value.toLowerCase()));
            if (first && value.trim()) seekTo(first.start_s);
          }}
          onSearchKeyDown={onSearchKeyDown}
          onSeek={seekTo}
          onScrollPositionChange={onTranscriptScroll}
          onSelectRange={setSelectedSentenceRange}
          query={query}
          scrollContainerRef={transcriptScrollRef}
          searchInputRef={searchInputRef}
          selectedRange={selectedSentenceRange}
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
            resolution={resolution}
            sentences={sentences}
          />
          <div className="relative">
            <PreviewControls
              layerCount={layers.length}
              onLayers={() => setLayersOpen((value) => !value)}
              onSetResolution={onResolutionChange}
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

function normalizeResolutionPreset(candidate: unknown, fallback: unknown = "1080p"): "1080p" | "720p" | "9:16" {
  if (candidate === "1080p" || candidate === "720p" || candidate === "9:16") {
    return candidate;
  }
  if (fallback === "1080p" || fallback === "720p" || fallback === "9:16") {
    return fallback;
  }
  return "1080p";
}

function selectRecoverySelection(selection: EditorRecoverySelection, layers: Layer[]): EditorSelection {
  if (!selection) return null;
  const layer = layers.find((entry) => entry.id === selection.layerId && entry.kind !== "sub");
  if (!layer) return null;
  const hasItem = layer.items.some((item) => hasVisualItemId(item) && item.id === selection.itemId);
  return hasItem ? selection : null;
}

function hasVisualItemId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function sanitizeTranscriptSentences(transcript: Project["transcript"] | null | undefined): AlignedSentence[] {
  if (!transcript) return [];
  const candidate = transcript as Project["transcript"] & { sentences?: Array<Partial<AlignedSentence>> };
  const raw = Array.isArray(candidate.sentences) ? candidate.sentences : [];
  const normalized = raw
    .filter((sentence): sentence is Required<Pick<AlignedSentence, "confidence_avg" | "end_s" | "index" | "start_s" | "text">> => {
      return (
        typeof sentence.index === "number" &&
        Number.isFinite(sentence.index) &&
        typeof sentence.text === "string" &&
        sentence.text.trim().length > 0 &&
        typeof sentence.start_s === "number" &&
        Number.isFinite(sentence.start_s) &&
        typeof sentence.end_s === "number" &&
        Number.isFinite(sentence.end_s) &&
        typeof sentence.confidence_avg === "number" &&
        Number.isFinite(sentence.confidence_avg)
      );
    })
    .sort((left, right) => left.index - right.index)
    .map((sentence, index) => ({
      ...sentence,
      index: index + 1,
      text: sentence.text.trim(),
    }));
  return normalized;
}

type SentenceMergeResult = {
  range: [number, number];
  sentences: AlignedSentence[];
};

function mergeSentences(sentences: AlignedSentence[], mergeRequest: [number, number]): SentenceMergeResult | null {
  const range = resolveMergeRange(sentences, mergeRequest);
  if (!range) return null;
  const startPosition = sentences.findIndex((sentence) => sentence.index === range[0]);
  const endPosition = sentences.findIndex((sentence) => sentence.index === range[1]);
  if (startPosition < 0 || endPosition < startPosition) return null;
  const selected = sentences.slice(startPosition, endPosition + 1);
  const head = selected[0];
  const tail = selected[selected.length - 1];
  if (!head || !tail) return null;
  const merged: AlignedSentence = {
    index: range[0],
    text: selected.map((sentence) => sentence.text.trim()).filter(Boolean).join(" "),
    start_s: head.start_s,
    end_s: tail.end_s,
    confidence_avg: selected.reduce((value, sentence) => Math.min(value, sentence.confidence_avg), head.confidence_avg),
  };
  const removedCount = range[1] - range[0];
  return {
    range,
    sentences: [
      ...sentences.slice(0, startPosition),
      merged,
      ...sentences.slice(endPosition + 1).map((sentence) => ({ ...sentence, index: sentence.index - removedCount })),
    ],
  };
}

function resolveMergeRange(sentences: AlignedSentence[], mergeRequest: [number, number]): [number, number] | null {
  if (sentences.length < 2) return null;
  const [inputStart, inputEnd] = normalizeSentenceRange(mergeRequest);
  const firstIndex = sentences[0]?.index ?? 1;
  const lastIndex = sentences.at(-1)?.index ?? firstIndex;
  const start = clampSentenceIndex(inputStart, firstIndex, lastIndex);
  const end = clampSentenceIndex(inputEnd, start, lastIndex);
  if (start === end) {
    if (end >= lastIndex) return null;
    return [start, end + 1];
  }
  return [start, end];
}

function clampSentenceIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSentenceRange(range: [number, number]): [number, number] {
  return [Math.min(range[0], range[1]), Math.max(range[0], range[1])];
}

function remapLayersAfterSentenceMerge(layers: Layer[], mergeRange: [number, number], sentences: AlignedSentence[]): Layer[] {
  return layers.map((layer) => {
    if (layer.kind === "sub") return layer;
    if (layer.kind === "bg") return { ...layer, items: layer.items.map((item) => remapVisualItemAfterSentenceMerge(item, mergeRange, sentences)) };
    if (layer.kind === "fg") return { ...layer, items: layer.items.map((item) => remapVisualItemAfterSentenceMerge(item, mergeRange, sentences)) };
    return { ...layer, items: layer.items.map((item) => remapVisualItemAfterSentenceMerge(item, mergeRange, sentences)) };
  });
}

function remapVisualItemAfterSentenceMerge<
  T extends { anchor?: "sentences" | "time"; end: number; sentences: [number, number]; start: number; orphan_reason?: string | null; orphaned?: boolean },
>(
  item: T,
  mergeRange: [number, number],
  sentences: AlignedSentence[],
): T {
  if (item.anchor === "time") return item;
  const nextRange = normalizeMergedRange(item.sentences, mergeRange);
  const start = sentences.find((sentence) => sentence.index === nextRange[0])?.start_s;
  const end = sentences.find((sentence) => sentence.index === nextRange[1])?.end_s;
  const orphaned = start === undefined || end === undefined || item.orphaned === true;
  return {
    ...item,
    sentences: nextRange,
    start: start ?? item.start,
    end: end ?? item.end,
    orphaned,
    orphan_reason: orphaned ? (item.orphan_reason ?? "missing_sentence_anchor") : null,
  };
}

function normalizeMergedRange(range: [number, number], mergeRange: [number, number]): [number, number] {
  const [from, to] = mergeRange;
  const removed = to - from;
  const normalized = normalizeSentenceRange(range);
  const remap = (value: number) => {
    if (value < from) return value;
    if (value <= to) return from;
    return value - removed;
  };
  return normalizeSentenceRange([remap(normalized[0]), remap(normalized[1])]);
}

type DraftProgressEvent = {
  type: "progress";
  render_id: string;
  stage: "cache_warm" | "compose" | "muxing" | "done" | "error" | "cancelled";
  percent: number;
  message?: string;
  output_path?: string;
};

function connectDraftProgress(
  projectId: string,
  renderId: string,
  outputPath: string,
  setRenderJob: Dispatch<SetStateAction<EditorRenderJob>>,
  onReady: () => void,
): WebSocket {
  const socket = new WebSocket(renderWsUrl(projectId, renderId));
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

function renderWsUrl(projectId: string, renderId: string): string {
  const query = new URLSearchParams({ project_id: projectId, render_id: renderId });
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

function renderQueuePath(projectId: string, preset: "draft" | "final", resolution: string): `/${string}` {
  const renderResolution = resolution === "9:16" ? "1080x1920" : resolution === "720p" ? "1280x720" : "1920x1080";
  return `/projects/${encodeURIComponent(projectId)}/render?preset=${preset}&resolution=${renderResolution}` as `/${string}`;
}

export default function EditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}
