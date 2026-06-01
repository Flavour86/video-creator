"use client";

import { KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MediaAsset, MediaRole, Project, ProjectConfigLoadResponse, ProjectConfigSaveResponse, TranscriptSentenceCue } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { AssignModal } from "@/components/assign-modal/AssignModal";
import { BgModal } from "@/components/bg-modal/BgModal";
import { EditorBar } from "@/components/editor/EditorBar";
import { EditorModal } from "@/components/editor/EditorModal";
import { Inspector } from "@/components/editor/Inspector";
import { LayersPopover } from "@/components/editor/LayersPopover";
import { PreviewControls } from "@/components/editor/PreviewControls";
import { PreviewSurface } from "@/components/editor/PreviewSurface";
import { RenderStrip } from "@/components/editor/RenderStrip";
import { Timeline } from "@/components/editor/Timeline";
import { TranscriptPane } from "@/components/editor/TranscriptPane";
import { WatermarkModal } from "@/components/editor/WatermarkModal";
import type { EditorMediaItem, EditorModal as EditorModalKind, EditorRenderJob, EditorSelection } from "@/components/editor/types";
import { request, ServerRequestError } from "@/lib/api/server";
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
import { deleteVisualItem, hasSentenceOverlap, normalizeBackgroundPlaylists, patchBackgroundItems, patchVisualItem } from "@/lib/layers";
import { reorderItemsByIds } from "@/lib/media-order";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { renderRoute } from "@/lib/render/routes";
import { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";

type BgLayer = Extract<Layer, { kind: "bg" }>;
type ClipLayer = Extract<Layer, { kind: "fg" | "pip" }>;
type ClipCacheState = "warm" | "cold" | "partial" | "invalid";
type ClipCacheSummary = { cachedCount: number; state: ClipCacheState; totalCount: number };
type LocalCacheInvalidation = "none" | "clip" | "output";
type CacheSummaryError = string | null;
type ConfigAssetIssue = {
  id: string;
  message: string;
};
type ConfigAssetReference = {
  mediaId: string;
  role: MediaRole;
  source: string;
};
type RenderCacheResponse = {
  cached_count: number;
  project_id: string;
  state: ClipCacheState;
  total_count: number;
};

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

function isSpaceShortcutInteractiveTarget(target: EventTarget | null): boolean {
  return isTextEditingTarget(target);
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
  const [audioDuration, setAudioDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolution, setResolution] = useState<"1080p" | "720p" | "9:16">("1080p");
  const [modal, setModal] = useState<EditorModalKind>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [renderJob, setRenderJob] = useState<EditorRenderJob>({ phase: "", progress: 0, running: false, status: "idle" });
  const [serverCacheSummary, setServerCacheSummary] = useState<ClipCacheSummary | null>(null);
  const [localCacheInvalidation, setLocalCacheInvalidation] = useState<LocalCacheInvalidation>("none");
  const [cacheSummaryError, setCacheSummaryError] = useState<CacheSummaryError>(null);
  const [assignRange, setAssignRange] = useState<[number, number]>([1, 1]);
  const [assignEdit, setAssignEdit] = useState<{ itemId?: string; layerId?: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"pending" | "saving" | "saved" | "failed">("pending");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number>(0);
  const pendingSelectedRangeRef = useRef<[number, number] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedProjectRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const renderSocketRef = useRef<WebSocket | null>(null);
  const appliedAlignmentSignatureRef = useRef("");
  const canonicalProjectRef = useRef<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const latestConfigHashRef = useRef<string | null>(null);
  const autosaveBaselineRef = useRef<string | null>(null);
  const inFlightSaveRef = useRef<Promise<string | null> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alignmentSentences = useMemo(() => alignmentState.status === "done" ? alignmentState.result.sentences : [], [alignmentState]);
  const normalizedAlignmentSentences = useMemo(
    () => normalizeAlignedSentences(alignmentSentences),
    [alignmentSentences],
  );
  const [sentences, setSentences] = useState<AlignedSentence[]>([]);
  const duration = Math.max(audioDuration, sentences.at(-1)?.end_s ?? 0);
  const timelineDuration = duration;
  const localCacheSummary = useMemo(() => deriveClipCacheSummaryFromLayers(layers), [layers]);
  const effectiveCacheSummary = useMemo(
    () => resolveClipCacheSummary(localCacheSummary, serverCacheSummary, localCacheInvalidation),
    [localCacheInvalidation, localCacheSummary, serverCacheSummary],
  );
  const cacheLabel = effectiveCacheSummary.state === "warm"
    ? `cache ${effectiveCacheSummary.cachedCount}/${effectiveCacheSummary.totalCount}`
    : `cache ${effectiveCacheSummary.state} ${effectiveCacheSummary.cachedCount}/${effectiveCacheSummary.totalCount}`;
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
  const renderDraftDisabled = saving || renderJob.running || !project || !renderHashDiffers;
  const renderFinalDisabled = saving || renderJob.running || !project || !renderHashDiffers;
  const scopedMedia = useMemo(
    () => scopeEditorMedia(media, layers, project?.watermark ?? null),
    [layers, media, project?.watermark],
  );
  const configAssetIssues = useMemo(
    () => project ? collectConfigAssetIssues(project.media ?? [], layers, project.watermark) : [],
    [layers, project],
  );
  const visualMedia = scopedMedia.visual;

  const refreshRenderCacheSummary = useCallback(async (id: string, fallback: ClipCacheSummary) => {
    try {
      const cacheResponse = await request<RenderCacheResponse>(`/projects/${encodeURIComponent(id)}/render-cache` as `/${string}`);
      setServerCacheSummary(normalizeRenderCacheSummary(cacheResponse, fallback));
      setCacheSummaryError(null);
    } catch (error) {
      if (!(error instanceof ServerRequestError)) {
        throw error;
      }
      setServerCacheSummary(fallback);
      const summaryError = summarizeCacheSummaryError(error);
      setCacheSummaryError(summaryError);
      console.warn("Editor render-cache summary fetch failed", { error: summaryError, projectId: id });
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    try {
      setAudioDuration(0);
      setServerCacheSummary(null);
      setLocalCacheInvalidation("none");
      setCacheSummaryError(null);
      const response = await request<ProjectConfigLoadResponse>(`/projects/${encodeURIComponent(id)}/config` as `/${string}`);
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
      const normalizedBackgrounds = normalizeBackgroundPlaylists(ensureSubtitleLayer(working.layers));
      const workingLayers = normalizedBackgrounds.layers;
      const workingConfig = {
        ...config,
        layers: workingLayers as Project["layers"],
        transcript: working.transcript,
        output: working.output,
        subtitles: working.subtitles,
        watermark: working.watermark,
      };
      const needsConfigAutosave = projectConfigSignature(workingConfig) !== projectConfigSignature(config);
      let loadedCacheSummary = deriveClipCacheSummaryFromLayers(workingLayers);
      try {
        const cacheResponse = await request<RenderCacheResponse>(`/projects/${encodeURIComponent(id)}/render-cache` as `/${string}`);
        loadedCacheSummary = normalizeRenderCacheSummary(cacheResponse, loadedCacheSummary);
        setCacheSummaryError(null);
      } catch (error) {
        if (!(error instanceof ServerRequestError)) {
          throw error;
        }
        const summaryError = summarizeCacheSummaryError(error);
        setCacheSummaryError(summaryError);
        console.warn("Editor render-cache summary fetch failed", { error: summaryError, projectId: id });
        // Keep config-derived cache summary when cache endpoint is unavailable.
      }
      const selected = selectRecoverySelection(recoveryState?.selected ?? null, workingLayers);
      loadedProjectRef.current = true;
      skipAutosaveRef.current = !needsConfigAutosave;
      pendingScrollTopRef.current = recoveryState?.transcriptScrollTop ?? 0;
      pendingSelectedRangeRef.current = recoveryState?.selectedRange ?? null;
      autosaveBaselineRef.current = projectConfigSignature(config);
      latestConfigHashRef.current = response.config_hash;
      canonicalProjectRef.current = config;
      projectRef.current = workingConfig;
      layersRef.current = workingLayers;
      setCanonicalProject(config);
      setProject(workingConfig);
      setProjectName(workingConfig.name ?? id);
      setProjectPath(resolvedProjectPath);
      setAudioFile(workingConfig.audio ?? "");
      const dirty = response.has_unrendered_changes || operationLog.undo.length > 0 || workingLayers !== working.layers || normalizedBackgrounds.changed;
      setHasUnrenderedChanges(dirty);
      setLatestConfigHash(response.config_hash);
      setLastRenderedConfigHash(response.last_rendered_config_hash ?? null);
      setSaveStatus(dirty ? "pending" : "saved");
      setLayers(workingLayers);
      const configMedia = toEditorMediaItemsFromConfig(workingConfig.media ?? [], workingLayers, workingConfig.watermark);
      setMedia(normalizeEditorMediaItems(configMedia));
      setServerCacheSummary(loadedCacheSummary);
      setLocalCacheInvalidation(normalizedBackgrounds.changed ? "clip" : "none");
      setSelected(selected);
      setResolution(normalizeResolutionPreset(recoveryState?.resolution, working.output?.resolution));
    } catch {
      loadedProjectRef.current = false;
      canonicalProjectRef.current = null;
      projectRef.current = null;
      layersRef.current = [];
      setCanonicalProject(null);
      setProject(null);
      setProjectName(id);
      setProjectPath("");
      setLayers([]);
      setMedia([]);
      setServerCacheSummary(null);
      setLocalCacheInvalidation("none");
      setCacheSummaryError(null);
      setSelected(null);
      setSelectedSentenceRange(null);
      setResolution("1080p");
      setLatestConfigHash(null);
      latestConfigHashRef.current = null;
      autosaveBaselineRef.current = null;
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
    if (projectId) return;
    router.replace("/");
  }, [projectId, router]);

  useEffect(() => {
    if (!projectId) return;
    void loadProject(projectId);
  }, [loadProject, projectId]);

  useEffect(() => {
    appliedAlignmentSignatureRef.current = "";
  }, [projectId]);

  useEffect(() => {
    const transcriptSentences = sanitizeTranscriptSentences(project?.transcript);
    setSentences(
      transcriptSentences.length > 0
        ? transcriptSentences
        : normalizedAlignmentSentences,
    );
    if (pendingSelectedRangeRef.current) {
      setSelectedSentenceRange(pendingSelectedRangeRef.current);
      pendingSelectedRangeRef.current = null;
    }
  }, [normalizedAlignmentSentences, project?.transcript]);

  useEffect(() => {
    if (!project || !loadedProjectRef.current) return;
    const transcriptSentences = sanitizeTranscriptSentences(project.transcript);
    if (transcriptSentences.length > 0 || normalizedAlignmentSentences.length === 0) return;
    const signature = alignmentSignature(alignmentSentences);
    if (appliedAlignmentSignatureRef.current === signature) return;
    appliedAlignmentSignatureRef.current = signature;
    const remapped = remapLayersAfterAlignmentRerun(layers, alignmentSentences);
    if (!remapped.changed) return;
    setLayers(remapped.layers);
    setProject({ ...project, layers: remapped.layers as Project["layers"] });
    setSelected((current) => selectRecoverySelection(current as EditorRecoverySelection, remapped.layers));
    setLocalCacheInvalidation(deriveClipCacheSummaryFromLayers(remapped.layers).state === "invalid" ? "clip" : "none");
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [alignmentSentences, layers, normalizedAlignmentSentences, project]);

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
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      if (audio.readyState < 2) {
        try {
          audio.load();
        } catch {
          // JSDOM does not implement HTMLMediaElement.load().
        }
      }
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

  useEffect(() => {
    canonicalProjectRef.current = canonicalProject;
  }, [canonicalProject]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    latestConfigHashRef.current = latestConfigHash;
  }, [latestConfigHash]);

  const buildCurrentSaveProject = useCallback((): Project | null => {
    const canonical = canonicalProjectRef.current;
    const currentProject = projectRef.current;
    if (!canonical || !currentProject) return null;
    const replayedProject = buildWorkingConfig(canonical, projectId);
    return {
      ...replayedProject,
      layers: layersRef.current as Project["layers"],
      media: currentProject.media,
      transcript: currentProject.transcript,
      output: currentProject.output,
      subtitles: currentProject.subtitles,
      watermark: currentProject.watermark,
    };
  }, [projectId]);

  const saveNow = useCallback(async (): Promise<string | null> => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    for (;;) {
      const nextProject = buildCurrentSaveProject();
      if (!nextProject) {
        setSaveStatus("failed");
        return null;
      }
      if (!isValidProjectSaveConfig(nextProject)) {
        setSaveStatus("failed");
        return null;
      }
      const signature = projectConfigSignature(nextProject);
      if (autosaveBaselineRef.current === signature) {
        return latestConfigHashRef.current;
      }

      const inFlight = inFlightSaveRef.current;
      if (inFlight) {
        const inFlightHash = await inFlight;
        if (!inFlightHash) return null;
        continue;
      }

      setSaving(true);
      setSaveStatus("saving");
      const savePromise = (async () => {
        try {
          const response = await request<ProjectConfigSaveResponse>(`/projects/${encodeURIComponent(projectId)}/config` as `/${string}`, {
            method: "PUT",
            body: { config: nextProject },
          });
          autosaveBaselineRef.current = signature;
          latestConfigHashRef.current = response.config_hash;
          canonicalProjectRef.current = nextProject;
          setCanonicalProject(nextProject);
          setLatestConfigHash(response.config_hash);
          setHasUnrenderedChanges(response.has_unrendered_changes);
          const currentProject = buildCurrentSaveProject();
          const savedStillCurrent = currentProject !== null && projectConfigSignature(currentProject) === signature;
          if (savedStillCurrent) {
            projectRef.current = nextProject;
            layersRef.current = (nextProject.layers ?? []) as Layer[];
            setProject(nextProject);
            setLayers((nextProject.layers ?? []) as Layer[]);
            clearOperationLog(projectId);
            setSaveStatus("saved");
          }
          return response.config_hash;
        } catch {
          setSaveStatus("failed");
          return null;
        }
      })();

      inFlightSaveRef.current = savePromise;
      const savedHash = await savePromise;
      if (inFlightSaveRef.current === savePromise) {
        inFlightSaveRef.current = null;
        setSaving(false);
      }
      if (!savedHash) return null;

      const currentProject = buildCurrentSaveProject();
      if (!currentProject || projectConfigSignature(currentProject) === signature) {
        return savedHash;
      }
    }
  }, [buildCurrentSaveProject, projectId]);

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
    if (!projectId || !project || !loadedProjectRef.current) {
      return;
    }
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const nextProject = buildCurrentSaveProject();
    if (!nextProject || autosaveBaselineRef.current === projectConfigSignature(nextProject)) {
      return;
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveNow();
    }, 75);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [buildCurrentSaveProject, layers, project, projectId, saveNow]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.key === " " || event.code === "Space") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.defaultPrevented) return;
        if (isSpaceShortcutInteractiveTarget(event.target)) return;
        event.preventDefault();
        setPlaying((value) => !value);
        return;
      }
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
      setSentences(
        transcriptSentences.length > 0
          ? transcriptSentences
          : normalizedAlignmentSentences,
      );
      setResolution(normalizeResolutionPreset(result.state.output?.resolution, resolution));
      const hasInvalidLayers = deriveClipCacheSummaryFromLayers(result.state.layers).state === "invalid";
      const previousResolution = normalizeResolutionPreset(project.output?.resolution, resolution);
      const nextResolution = normalizeResolutionPreset(result.state.output?.resolution, previousResolution);
      setLocalCacheInvalidation(nextResolution !== previousResolution ? "output" : hasInvalidLayers ? "clip" : "none");
      setHasUnrenderedChanges(true);
      setSaveStatus("pending");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layers, normalizedAlignmentSentences, project, projectId, resolution]);

  const renderDraft = useCallback(async () => {
    if (!projectId || !project || renderDraftDisabled) return;
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
        setLocalCacheInvalidation("none");
        void refreshRenderCacheSummary(projectId, deriveClipCacheSummaryFromLayers(layers));
      });
    } catch {
      setRenderJob({ phase: "failed", progress: 0, running: false, status: "failed", message: "Render failed to start." });
    }
  }, [layers, project, projectId, refreshRenderCacheSummary, renderDraftDisabled, resolution, saveNow]);

  const cancelDraft = useCallback(async () => {
    if (!renderJob.renderId || (renderJob.status !== "queued" && renderJob.status !== "running")) return;
    renderSocketRef.current?.close();
    setRenderJob((job) => ({ ...job, phase: "cancelling", running: true, status: "running" }));
    try {
      await request(`/projects/${encodeURIComponent(projectId)}/render/${encodeURIComponent(renderJob.renderId)}` as `/${string}`, { method: "DELETE" });
      setRenderJob((job) => ({ ...job, phase: "cancelled", progress: 0, running: false, status: "cancelled", message: "Render cancelled." }));
    } catch {
      setRenderJob((job) => ({ ...job, phase: "cancel failed", running: false, status: "failed", message: "Render cancel failed." }));
    }
  }, [projectId, renderJob.renderId, renderJob.status]);

  const renderFinal = useCallback(async () => {
    if (!projectId || !project || renderFinalDisabled) return;
    const savedConfigHash = await saveNow();
    if (!savedConfigHash) return;
    try {
      const result = await request<{ render_id: string }>(
        renderQueuePath(projectId, "final", resolution),
        { method: "POST" },
      );
      setLatestConfigHash(savedConfigHash);
      router.push(renderRoute(projectId, result.render_id) as Parameters<typeof router.push>[0]);
      return;
    } catch {
      setRenderJob({ phase: "failed", progress: 0, running: false, status: "failed", message: "Final render failed to start." });
    }
  }, [project, projectId, renderFinalDisabled, resolution, router, saveNow]);

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
    setAssignEdit(null);
    setSelectedSentenceRange(range);
    setModal("upload");
  }, []);

  const openAssignEdit = useCallback((layerId: string, itemId: string, range: [number, number]) => {
    setAssignRange(range);
    setAssignEdit({ layerId, itemId });
    setSelectedSentenceRange(range);
    setModal("upload");
  }, []);

  const applyLayerMutation = useCallback((updatedLayers: Layer[], options?: { closeModal?: boolean; nextSelection?: EditorSelection }) => {
    const currentProject = projectRef.current ?? project;
    if (!currentProject) return;
    const previousLayers = layers;
    const nextProject = { ...currentProject, layers: updatedLayers as Project["layers"] };
    layersRef.current = updatedLayers;
    projectRef.current = nextProject;
    setLayers(updatedLayers);
    setProject(nextProject);
    if (options?.nextSelection !== undefined) {
      setSelected(options.nextSelection);
    }
    if (options?.closeModal) {
      setModal(null);
    }
    if (projectId) {
      appendOperation(projectId, {
        type: "replace_layers",
        before: previousLayers,
        after: updatedLayers,
      });
    }
    setLocalCacheInvalidation("clip");
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [layers, project, projectId]);

  const applyAssignedLayers = useCallback((updatedLayers: Layer[], newLayerId: string, newItemId: string) => {
    applyLayerMutation(updatedLayers, {
      closeModal: true,
      nextSelection: { layerId: newLayerId, itemId: newItemId },
    });
  }, [applyLayerMutation]);

  const applyBackgroundLayer = useCallback((backgroundLayer: BgLayer) => {
    const backgroundIndex = layers.findIndex((layer) => layer.kind === "bg");
    const updatedLayers = backgroundIndex >= 0
      ? layers.map((layer, index) => (index === backgroundIndex ? backgroundLayer : layer))
      : [...layers, backgroundLayer];
    const selectedItem = backgroundLayer.items[0];
    applyLayerMutation(updatedLayers, {
      closeModal: true,
      nextSelection: selectedItem ? { layerId: backgroundLayer.id, itemId: selectedItem.id } : defaultSelectionFromLayers(updatedLayers),
    });
  }, [applyLayerMutation, layers]);

  const removeBackgroundLayer = useCallback((layerId: string) => {
    const hasTarget = layers.some((layer) => layer.kind === "bg" && layer.id === layerId);
    if (!hasTarget) return;
    const updatedLayers = layers.filter((layer) => !(layer.kind === "bg" && layer.id === layerId));
    applyLayerMutation(updatedLayers, { nextSelection: defaultSelectionFromLayers(updatedLayers) });
  }, [applyLayerMutation, layers]);

  const patchInspectorBackground = useCallback((layerId: string, patch: { crossfade?: number; motion?: Partial<{ easing: string; kind: string }> }) => {
    const updatedLayers = patchBackgroundItems(layers, layerId, patch);
    applyLayerMutation(updatedLayers);
  }, [applyLayerMutation, layers]);

  const patchInspectorItem = useCallback((
    layerId: string,
    itemId: string,
    patch: {
      mediaId?: string;
      mediaIds?: string[];
      motion?: Partial<{ easing: string; kind: string }>;
      pip?: Partial<{ opacity: number; posX: number; posY: number; radius: number; size: number }>;
      transitions?: Partial<{ in: string; out: string }>;
    },
  ) => {
    const updatedLayers = patchVisualItem(layers, layerId, itemId, patch);
    applyLayerMutation(updatedLayers);
  }, [applyLayerMutation, layers]);

  const patchInspectorRange = useCallback((layerId: string, itemId: string, range: [number, number]) => {
    const target = findVisualItemById(layers, layerId, itemId);
    if (!target) return;
    const maxSentence = Math.max(1, ...sentences.map((sentence) => sentence.index));
    const from = clamp(Math.min(range[0], range[1]), 1, maxSentence);
    const to = clamp(Math.max(range[0], range[1]), from, maxSentence);
    const startSentence = sentences.find((sentence) => sentence.index === from);
    const endSentence = sentences.find((sentence) => sentence.index === to);
    const overlapLayer = layers.find((entry): entry is ClipLayer => entry.id === layerId && (entry.kind === "fg" || entry.kind === "pip"));
    if (overlapLayer && hasSentenceOverlap(overlapLayer.items, from, to, itemId)) {
      return;
    }
    const updatedLayers = patchVisualItem(layers, layerId, itemId, {
      sentences: [from, to],
      start: startSentence?.start_s ?? target.start,
      end: endSentence?.end_s ?? target.end,
    });
    applyLayerMutation(updatedLayers);
  }, [applyLayerMutation, layers, sentences]);

  const updateTimelineClipTiming = useCallback((input: { layerId: string; itemId: string; start: number; end: number }) => {
    const target = findVisualItemById(layers, input.layerId, input.itemId);
    if (!target) return;
    const layer = layers.find((entry): entry is ClipLayer => entry.id === input.layerId && (entry.kind === "fg" || entry.kind === "pip"));
    const boundedStart = clamp(input.start, 0, Math.max(0, timelineDuration - MIN_CLIP_DURATION_SECONDS));
    const boundedEnd = clamp(input.end, boundedStart + MIN_CLIP_DURATION_SECONDS, Math.max(timelineDuration, boundedStart + MIN_CLIP_DURATION_SECONDS));
    const nextRange = resolveSentenceRangeForSpan(
      sentences,
      boundedStart,
      boundedEnd,
      target.sentences ?? [sentences[0]?.index ?? 1, sentences[0]?.index ?? 1],
    );
    if (layer && hasSentenceOverlap(layer.items, nextRange[0], nextRange[1], input.itemId)) {
      return;
    }
    const updatedLayers = patchVisualItem(layers, input.layerId, input.itemId, {
      start: boundedStart,
      end: boundedEnd,
      sentences: nextRange,
    });
    applyLayerMutation(updatedLayers);
  }, [applyLayerMutation, layers, sentences, timelineDuration]);

  const deleteInspectorItem = useCallback((layerId: string, itemId: string) => {
    const updatedLayers = deleteVisualItem(layers, layerId, itemId);
    applyLayerMutation(updatedLayers, { nextSelection: defaultSelectionFromLayers(updatedLayers) });
  }, [applyLayerMutation, layers]);

  useEffect(() => {
    function onDeleteKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selected || isTextEditingTarget(event.target)) return;
      const selectedLayer = layers.find((layer) => layer.id === selected.layerId);
      if (!selectedLayer || selectedLayer.kind === "bg" || selectedLayer.kind === "sub") return;
      event.preventDefault();
      deleteInspectorItem(selected.layerId, selected.itemId);
    }
    window.addEventListener("keydown", onDeleteKey);
    return () => window.removeEventListener("keydown", onDeleteKey);
  }, [deleteInspectorItem, layers, selected]);

  const applySubtitlesSettings = useCallback((nextSubtitles: Project["subtitles"]) => {
    if (!project) return;
    const previousSubtitles = project.subtitles;
    setProject({ ...project, subtitles: nextSubtitles });
    setModal(null);
    if (projectId) {
      appendOperation(projectId, {
        type: "subtitle_settings_update",
        before: previousSubtitles,
        after: nextSubtitles,
      });
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [project, projectId]);

  const applyWatermarkSettings = useCallback((nextWatermark: Project["watermark"]) => {
    const currentProject = projectRef.current ?? project;
    if (!currentProject) return;
    const previousWatermark = currentProject.watermark;
    const nextConfigMedia = promoteWatermarkSelection(currentProject.media ?? [], nextWatermark);
    const nextProject = { ...currentProject, media: nextConfigMedia, watermark: nextWatermark };
    projectRef.current = nextProject;
    setProject(nextProject);
    setMedia((previous) => promoteWatermarkSelectionInEditorMedia(previous, nextWatermark));
    if (projectId) {
      appendOperation(projectId, {
        type: "watermark_update",
        before: previousWatermark,
        after: nextWatermark,
      });
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [project, projectId]);

  const playFromSentence = useCallback((index: number) => {
    const sentence = sentences.find((item) => item.index === index);
    if (!sentence) return;
    seekTo(sentence.start_s);
    setPlaying(true);
  }, [seekTo, sentences]);

  const seekTranscriptSentence = useCallback((time: number) => {
    seekTo(time);
    setPlaying(false);
  }, [seekTo]);

  const mergeSentenceWithNext = useCallback((range: [number, number]) => {
    if (!project) return;
    const mergeResult = mergeSentences(sentences, range);
    if (!mergeResult) return;
    const nextLayers = remapLayersAfterSentenceMerge(layers, mergeResult.range, mergeResult.sentences);
    const nextTranscriptSentences = mergeResult.sentences.length > 0
      ? (mergeResult.sentences as [TranscriptSentenceCue, ...TranscriptSentenceCue[]])
      : undefined;
    const nextTranscript: Project["transcript"] = {
      ...project.transcript,
      sentences: nextTranscriptSentences,
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
    setLocalCacheInvalidation("clip");
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
    setLocalCacheInvalidation("output");
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

  const uploadEditorMedia = useCallback(async (files: FileList | null, options?: { role?: MediaRole; watermarkOnly?: boolean }): Promise<MediaAsset[]> => {
    if (!files || files.length === 0) return [];
    const incoming = options?.watermarkOnly
      ? Array.from(files).filter(isWatermarkImageFile).slice(0, 1)
      : Array.from(files);
    const uploaded: MediaAsset[] = [];
    const pendingIds = new Map<string, string>();
    setMedia((previous) => {
      let next = previous;
      for (const file of incoming) {
        const pending = pendingMediaItemFromFile(file, options?.role);
        pendingIds.set(pendingKeyForFile(file), pending.mediaId);
        next = mergePendingItem(next, pending);
      }
      return next;
    });
    for (const file of incoming) {
      const pendingId = pendingIds.get(pendingKeyForFile(file)) ?? `pending:${file.name}`;
      try {
        const response = await uploadFileWithSplits(file, {
          onProgress: (value) => {
            setMedia((previous) => updatePendingImportState(previous, pendingId, { import_progress: value, importing: true }));
          },
        });
        for (const entry of response) {
          uploaded.push(entry.media);
        }
        setMedia((previous) => previous.filter((entry) => entry.mediaId !== pendingId));
      } catch (error) {
        const message = parseServerErrorMessage(error);
        setMedia((previous) =>
          updatePendingImportState(previous, pendingId, {
            import_error: message,
            importing: false,
            import_progress: 0,
          }),
        );
      }
    }
    if (uploaded.length === 0) return [];
    return options?.watermarkOnly
      ? uploaded.map(promoteUploadedWatermarkAsset)
      : uploaded.map((entry) => withMediaRole(entry, options?.role));
  }, []);

  const importMedia = useCallback(async (files: FileList | null, options?: { role?: MediaRole; watermarkOnly?: boolean }) => {
    const startingProject = projectRef.current ?? project;
    if (!startingProject) return [];
    const normalizedUploaded = await uploadEditorMedia(files, options);
    if (normalizedUploaded.length === 0) return [];
    const currentProject = projectRef.current ?? startingProject;
    const currentLayers = layersRef.current.length > 0 ? layersRef.current : layers;
    const replacementWatermark = options?.watermarkOnly ? normalizedUploaded[0] : undefined;
    const nextConfigMedia = replacementWatermark
      ? replaceWatermarkAssets(currentProject.media ?? [], replacementWatermark)
      : mergeConfigMedia(currentProject.media ?? [], normalizedUploaded);
    const nextWatermark = replacementWatermark
      ? watermarkForReplacement(currentProject.watermark, replacementWatermark.id)
      : currentProject.watermark;
    const nextEditorMedia = toEditorMediaItemsFromConfig(nextConfigMedia, currentLayers, nextWatermark);
    const nextProject = { ...currentProject, media: nextConfigMedia, watermark: nextWatermark };
    projectRef.current = nextProject;
    setProject(nextProject);
    setMedia((previous) => mergeImportedMediaWithPending(nextEditorMedia, previous));
    if (replacementWatermark && projectId) {
      appendOperation(projectId, {
        type: "watermark_update",
        before: currentProject.watermark,
        after: nextWatermark,
      });
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
    return normalizedUploaded;
  }, [layers, project, projectId, uploadEditorMedia]);

  const replaceInspectorItemMedia = useCallback(async (layerId: string, itemId: string, files: FileList | null, mediaIndex?: number) => {
    const startingProject = projectRef.current ?? project;
    if (!startingProject) return;
    const startingLayers = layersRef.current.length > 0 ? layersRef.current : layers;
    const layer = startingLayers.find((entry) => entry.id === layerId);
    const uploaded = await uploadEditorMedia(files, { role: roleForLayerKind(layer?.kind) });
    const visualUploaded = uploaded.filter((entry) => entry.kind === "image" || entry.kind === "video");
    if (visualUploaded.length === 0) return;
    const currentProject = projectRef.current ?? startingProject;
    const currentLayers = layersRef.current.length > 0 ? layersRef.current : startingLayers;
    const currentLayer = currentLayers.find((entry) => entry.id === layerId);
    const mediaIds = visualUploaded.map((entry) => entry.id);
    if (!currentLayer || currentLayer.kind === "sub") return;
    const firstMediaId = mediaIds[0];
    if (currentLayer.kind !== "bg" && !firstMediaId) return;
    const targetItem = currentLayer.items.find((entry) => hasVisualItemId(entry) && entry.id === itemId);
    const currentBackgroundMediaIds = targetItem && "mediaIds" in targetItem && Array.isArray(targetItem.mediaIds)
      ? targetItem.mediaIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      : targetItem && "mediaId" in targetItem && typeof targetItem.mediaId === "string"
        ? [targetItem.mediaId]
        : [];
    const nextBackgroundMediaIds = currentLayer.kind === "bg" && mediaIndex !== undefined && firstMediaId
      ? currentBackgroundMediaIds.map((entry, index) => (index === mediaIndex ? firstMediaId : entry))
      : mediaIds;
    const previousLayers = currentLayers;
    const updatedLayers = patchVisualItem(
      currentLayers,
      layerId,
      itemId,
      currentLayer.kind === "bg" ? { mediaIds: nextBackgroundMediaIds } : { mediaId: firstMediaId },
    );
    const nextConfigMedia = mergeConfigMedia(currentProject.media ?? [], visualUploaded);
    const nextProject = { ...currentProject, media: nextConfigMedia, layers: updatedLayers as Project["layers"] };
    layersRef.current = updatedLayers;
    projectRef.current = nextProject;
    setLayers(updatedLayers);
    setProject(nextProject);
    setMedia((previous) => mergeImportedMediaWithPending(toEditorMediaItemsFromConfig(nextConfigMedia, updatedLayers, currentProject.watermark), previous));
    setSelected({ layerId, itemId });
    if (projectId) {
      appendOperation(projectId, {
        type: "replace_layers",
        before: previousLayers,
        after: updatedLayers,
      });
    }
    setLocalCacheInvalidation("clip");
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [layers, project, projectId, uploadEditorMedia]);

  const deleteMediaAsset = useCallback((mediaId: string) => {
    const currentProject = projectRef.current ?? project;
    if (!currentProject) return;
    const currentMedia = currentProject.media ?? [];
    if (!currentMedia.some((entry) => entry.id === mediaId)) return;
    const currentLayers = layersRef.current.length > 0 ? layersRef.current : layers;
    const nextMedia = currentMedia.filter((entry) => entry.id !== mediaId);
    const nextLayers = removeMediaReferencesFromLayers(currentLayers, mediaId);
    const nextWatermark = currentProject.watermark?.mediaId === mediaId ? null : currentProject.watermark;
    const nextProject = {
      ...currentProject,
      layers: nextLayers as Project["layers"],
      media: nextMedia,
      watermark: nextWatermark,
    };
    layersRef.current = nextLayers;
    projectRef.current = nextProject;
    setLayers(nextLayers);
    setProject(nextProject);
    setMedia((previous) => previous.filter((entry) => entry.mediaId !== mediaId));
    setSelected((current) => current && selectionExists(nextLayers, current) ? current : defaultSelectionFromLayers(nextLayers));
    if (nextLayers !== currentLayers) {
      setLocalCacheInvalidation("clip");
    }
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [layers, project]);

  const reorderMediaAssets = useCallback((orderedMediaIds: string[]) => {
    const currentProject = projectRef.current ?? project;
    if (!currentProject || orderedMediaIds.length < 2) return;
    const currentMedia = currentProject.media ?? [];
    const nextConfigMedia = reorderItemsByIds(currentMedia, orderedMediaIds, (entry) => entry.id);
    const configChanged = !sameItemOrder(currentMedia, nextConfigMedia);
    if (configChanged) {
      const nextProject = { ...currentProject, media: nextConfigMedia };
      projectRef.current = nextProject;
      setProject(nextProject);
      setHasUnrenderedChanges(true);
      setSaveStatus("pending");
    }
    setMedia((previous) => reorderItemsByIds(previous, orderedMediaIds, (entry) => entry.mediaId || entry.filename));
  }, [project]);

  const importWatermarkMedia = useCallback(async (files: FileList | null) => {
    await importMedia(files, { watermarkOnly: true });
  }, [importMedia]);

  if (!projectId) {
    return null;
  }

  return (
    <PageChrome className="grid min-h-0 grid-rows-[48px_auto_minmax(0,1fr)] overflow-y-auto lg:overflow-hidden" variant="workbench">
      <EditorBar
        onHome={() => router.push("/")}
        onRenderDraft={renderDraft}
        onRenderFinal={renderFinal}
        projectName={projectName}
        projectId={projectId}
        renderJob={renderJob}
        renderDraftDisabled={renderDraftDisabled}
        renderFinalDisabled={renderFinalDisabled}
        saveStatus={saveStatus}
      />
      <RenderStrip job={renderJob} onCancel={cancelDraft} />
      <div
        className="grid min-h-0 grid-cols-1 divide-y divide-(--line) bg-(--line) lg:grid-cols-[380px_minmax(0,1fr)_320px] lg:divide-x lg:divide-y-0"
        data-testid="editor-layout-grid"
      >
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
          onSeek={seekTranscriptSentence}
          onScrollPositionChange={onTranscriptScroll}
          onSelectRange={setSelectedSentenceRange}
          query={query}
          scrollContainerRef={transcriptScrollRef}
          searchInputRef={searchInputRef}
          selectedRange={selectedSentenceRange}
          sentences={sentences}
        />
        <main
          className="flex min-h-0 min-w-0 flex-col bg-(--bg-0)"
          data-cache-summary-error={cacheSummaryError ?? ""}
          data-testid="editor-center-pane"
        >
          <ConfigAssetIssueBanner issues={configAssetIssues} />
          <div className="flex min-h-0 flex-1 flex-col" data-testid="preview-stack">
            <PreviewSurface
              currentTime={currentTime}
              duration={duration}
              layers={layers}
              media={media}
              onNext={() => seekSentence(1)}
              onPrevious={() => seekSentence(-1)}
              onTogglePlay={() => setPlaying((value) => !value)}
              playbackClock={audioRef}
              playing={playing}
              projectPath={projectPath}
              resolution={resolution}
              sentences={sentences}
              subtitles={project?.subtitles ?? null}
              watermark={project?.watermark ?? null}
            />
            <div className="relative">
              <PreviewControls
                layerCount={layers.length}
                layersOpen={layersOpen}
                onLayers={() => setLayersOpen((value) => !value)}
                onSetResolution={onResolutionChange}
                resolution={resolution}
              />
              <LayersPopover
                layers={layers}
                onClose={() => setLayersOpen(false)}
                onRemoveBackground={(layerId) => {
                  removeBackgroundLayer(layerId);
                  setLayersOpen(false);
                }}
                onSelectLayerItem={(layerId, itemId) => {
                  setSelected({ layerId, itemId });
                  setLayersOpen(false);
                }}
                open={layersOpen}
                selected={selected}
              />
            </div>
          </div>
          <Timeline
            cacheLabel={cacheLabel}
            currentTime={currentTime}
            duration={timelineDuration}
            fps={30}
            layers={layers}
            onDeleteItem={({ layerId, itemId }) => deleteInspectorItem(layerId, itemId)}
            onSeek={seekTo}
            onSelect={setSelected}
            onUpdateClipTiming={updateTimelineClipTiming}
            selected={selected}
            sentences={sentences}
          />
        </main>
        <Inspector
          layers={layers}
          media={media}
          onDeleteItem={deleteInspectorItem}
          onOpenAssignEdit={openAssignEdit}
          onOpenBackground={() => setModal("background")}
          onOpenSubtitles={() => setModal("subtitles")}
          onOpenWatermark={() => setModal("watermark")}
          onPatchBackground={patchInspectorBackground}
          onPatchItem={patchInspectorItem}
          onRemoveBackground={removeBackgroundLayer}
          onReplaceItemMedia={replaceInspectorItemMedia}
          onUpdateRange={patchInspectorRange}
          projectPath={projectPath}
          selected={selected}
          subtitles={project?.subtitles ?? null}
          watermark={project?.watermark ?? null}
        />
      </div>
      {audioFile && projectPath ? (
        <audio
          data-testid="editor-audio"
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              setAudioDuration(nextDuration);
            }
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          preload="metadata"
          ref={audioRef}
          src={`/api/server/projects/audio?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(audioFile)}`}
        />
      ) : null}
      {modal === "upload" ? (
        <AssignModal
          editItemId={assignEdit?.itemId}
          editLayerId={assignEdit?.layerId}
          fromSentence={assignRange[0]}
          layers={layers}
          media={{
            foreground: scopedMedia.foreground.map(toAssignModalMedia),
            pip: scopedMedia.pip.map(toAssignModalMedia),
          }}
          onClose={() => setModal(null)}
          onDeleteMedia={deleteMediaAsset}
          onImport={(files, role) => importMedia(files, { role })}
          onReorderMedia={reorderMediaAssets}
          onConfirm={applyAssignedLayers}
          open
          sentences={sentences}
          toSentence={assignRange[1]}
        />
      ) : modal === "background" ? (
        <BgModal
          duration={duration}
          existing={(layers.find((layer) => layer.kind === "bg") as BgLayer | undefined)}
          media={scopedMedia.background.map((entry) => ({
            duration: entry.duration,
            filename: entry.filename,
            import_error: entry.import_error,
            importing: entry.importing,
            kind: entry.kind,
            mediaId: entry.mediaId,
            deletable: entry.deletable,
            thumb_url: entry.thumb_url,
          }))}
          onClose={() => setModal(null)}
          onDeleteMedia={deleteMediaAsset}
          onImport={(files) => importMedia(files, { role: "background" })}
          onReorderMedia={reorderMediaAssets}
          onSave={applyBackgroundLayer}
          open
          totalSentences={sentences.length}
        />
      ) : modal === "watermark" ? (
        <WatermarkModal
          media={scopedMedia.watermark}
          onChange={applyWatermarkSettings}
          onClose={() => setModal(null)}
          onDeleteMedia={deleteMediaAsset}
          onImport={importWatermarkMedia}
          onReorderMedia={reorderMediaAssets}
          open
          projectPath={projectPath}
          value={project?.watermark ?? null}
        />
      ) : (
        <EditorModal
          assignRange={assignRange}
          media={media}
          modal={modal}
          onApplySubtitles={applySubtitlesSettings}
          onClose={() => setModal(null)}
          onImport={importMedia}
          previewResolution={resolution}
          projectPath={projectPath}
          subtitles={project?.subtitles ?? null}
        />
      )}
    </PageChrome>
  );
}

async function resolveProjectPath(projectId: string): Promise<string> {
  try {
    const payload = await request<{ path?: string }>(
      `/projects/${encodeURIComponent(projectId)}/inspect` as `/${string}`,
      { method: "POST" },
    );
    return typeof payload.path === "string" ? payload.path : "";
  } catch {
    return "";
  }
}

function isValidProjectId(value: string): boolean {
  return /^p_[A-Za-z0-9_-]+$/.test(value);
}

function ConfigAssetIssueBanner({ issues }: { issues: ConfigAssetIssue[] }) {
  if (issues.length === 0) return null;
  const visibleIssues = issues.slice(0, 3);
  const remainingCount = issues.length - visibleIssues.length;
  return (
    <section
      aria-label="Config media errors"
      className="border-b border-(--red) bg-(--bg-1) px-3 py-2 text-xs text-(--text)"
      data-testid="config-media-errors"
      role="alert"
    >
      <div className="mb-1 font-semibold text-(--red)">Config media errors</div>
      <ul className="grid gap-0.5 font-mono text-[10.5px] text-(--text-2)">
        {visibleIssues.map((issue) => (
          <li className="truncate" key={issue.id}>{issue.message}</li>
        ))}
        {remainingCount > 0 ? <li className="text-(--text-3)">+{remainingCount} more</li> : null}
      </ul>
    </section>
  );
}

function projectConfigSignature(project: Project): string {
  return JSON.stringify(project);
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
  if (!selection) return defaultSelectionFromLayers(layers);
  const layer = layers.find((entry) => entry.id === selection.layerId && entry.kind !== "sub");
  if (!layer) return defaultSelectionFromLayers(layers);
  const hasItem = layer.items.some((item) => hasVisualItemId(item) && item.id === selection.itemId);
  return hasItem ? selection : defaultSelectionFromLayers(layers);
}

function defaultSelectionFromLayers(layers: Layer[]): EditorSelection {
  const backgroundLayer = layers.find((entry) => entry.kind === "bg");
  const backgroundItem = backgroundLayer?.items.find(hasVisualItemId);
  if (backgroundLayer && backgroundItem) {
    return { layerId: backgroundLayer.id, itemId: backgroundItem.id };
  }
  for (const layer of layers) {
    if (layer.kind === "sub") continue;
    const item = layer.items.find(hasVisualItemId);
    if (item) return { layerId: layer.id, itemId: item.id };
  }
  return null;
}

function defaultSubtitleLayer(): Extract<Layer, { kind: "sub" }> {
  return {
    id: "subtitles",
    kind: "sub",
    name: "Subtitles",
    items: [{ id: "sub-auto", auto: true, label: "Auto subtitles", style: "default" }],
  };
}

function ensureSubtitleLayer(layers: Layer[]): Layer[] {
  if (layers.some((layer) => layer.kind === "sub")) return layers;
  return [defaultSubtitleLayer(), ...layers];
}

function hasVisualItemId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function deriveClipCacheSummaryFromLayers(layers: Layer[]): ClipCacheSummary {
  const visualItems = layers
    .filter((layer) => layer.kind === "bg" || layer.kind === "fg" || layer.kind === "pip")
    .flatMap((layer) => layer.items);
  const totalCount = visualItems.length;
  let cachedCount = 0;
  let hasInvalid = false;
  for (const item of visualItems) {
    const status = cacheStatusFromItem(item);
    if (status === "warm") {
      cachedCount += 1;
      continue;
    }
    if (status === "invalid" || status === "orphaned") {
      hasInvalid = true;
    }
  }
  if (totalCount === 0 || cachedCount === 0) {
    return { state: hasInvalid ? "invalid" : "cold", cachedCount, totalCount };
  }
  if (hasInvalid) {
    return { state: "invalid", cachedCount, totalCount };
  }
  if (cachedCount === totalCount) {
    return { state: "warm", cachedCount, totalCount };
  }
  return { state: "partial", cachedCount, totalCount };
}

function resolveClipCacheSummary(local: ClipCacheSummary, remote: ClipCacheSummary | null, localInvalidation: LocalCacheInvalidation): ClipCacheSummary {
  if (!remote) return local;
  if (localInvalidation === "none") return remote;
  if (localInvalidation === "output") {
    return { state: remote.totalCount > 0 ? "invalid" : "cold", cachedCount: 0, totalCount: remote.totalCount };
  }
  return local;
}

function normalizeRenderCacheSummary(response: RenderCacheResponse, fallback: ClipCacheSummary): ClipCacheSummary {
  const totalCount = Math.max(0, Number.isFinite(response.total_count) ? response.total_count : fallback.totalCount);
  const rawCached = Number.isFinite(response.cached_count) ? response.cached_count : fallback.cachedCount;
  const cachedCount = Math.max(0, Math.min(rawCached, totalCount));
  const state: ClipCacheState = response.state === "warm" || response.state === "cold" || response.state === "partial" || response.state === "invalid"
    ? response.state
    : fallback.state;
  return { cachedCount, totalCount, state };
}

function summarizeCacheSummaryError(error: ServerRequestError): string {
  const payload = error.payload as { error?: { code?: unknown } } | null;
  const code = payload?.error?.code;
  if (typeof code === "string" && code.trim()) {
    return code;
  }
  return `status:${error.status}`;
}

function cacheStatusFromItem(item: unknown): string | null {
  if (typeof item !== "object" || item === null || !("cache_status" in item)) return null;
  const status = (item as { cache_status?: unknown }).cache_status;
  return typeof status === "string" ? status : null;
}

function findVisualItemById(layers: Layer[], layerId: string, itemId: string): {
  end: number;
  id: string;
  sentences: [number, number] | null;
  start: number;
} | null {
  const layer = layers.find((entry) => entry.id === layerId && entry.kind !== "sub");
  if (!layer) return null;
  for (const candidate of layer.items) {
    if (!hasVisualItemId(candidate) || candidate.id !== itemId) continue;
    if (!hasTimeBounds(candidate)) return null;
    return {
      id: candidate.id,
      start: candidate.start,
      end: candidate.end,
      sentences: hasSentenceBounds(candidate) ? candidate.sentences : null,
    };
  }
  return null;
}

function hasTimeBounds(value: unknown): value is { end: number; start: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MIN_CLIP_DURATION_SECONDS = 0.5;

function hasSentenceBounds(value: unknown): value is { sentences: [number, number] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "sentences" in value &&
    Array.isArray(value.sentences) &&
    value.sentences.length === 2 &&
    typeof value.sentences[0] === "number" &&
    typeof value.sentences[1] === "number"
  );
}

function resolveSentenceRangeForSpan(
  sentences: AlignedSentence[],
  start: number,
  end: number,
  fallback: [number, number],
): [number, number] {
  const covered = sentences.filter((sentence) => sentence.end_s > start && sentence.start_s < end);
  if (covered.length === 0) return fallback;
  const first = covered[0]?.index ?? fallback[0];
  const last = covered.at(-1)?.index ?? fallback[1];
  return [first, Math.max(first, last)];
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
    .map((sentence, index): AlignedSentence => ({
      confidence_avg: sentence.confidence_avg ?? 1,
      end_s: sentence.end_s,
      index: index + 1,
      start_s: sentence.start_s,
      text: sentence.text.trim(),
    }));
  return normalizeAlignedSentences(normalized);
}

function normalizeAlignedSentences(sentences: AlignedSentence[]): AlignedSentence[] {
  if (sentences.length === 0) return [];
  const MIN_SENTENCE_DURATION_SECONDS = 0.2;
  const normalized = sentences
    .map((sentence, index): AlignedSentence => ({
      confidence_avg: sentence.confidence_avg,
      end_s: sentence.end_s,
      index: index + 1,
      start_s: Math.max(0, sentence.start_s),
      text: sentence.text.trim(),
    }))
    .sort((left, right) => left.index - right.index);

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (!current) continue;
    const nextStart = normalized[index + 1]?.start_s;
    let end = current.end_s;
    if (typeof nextStart === "number" && end < nextStart) {
      end = nextStart;
    }
    if (end <= current.start_s) {
      end = typeof nextStart === "number" && nextStart > current.start_s
        ? nextStart
        : current.start_s + MIN_SENTENCE_DURATION_SECONDS;
    }
    normalized[index] = { ...current, end_s: end };
  }

  return normalized;
}

function alignmentSignature(sentences: AlignedSentence[]): string {
  return sentences.map((sentence) => `${sentence.index}:${sentence.start_s}:${sentence.end_s}:${sentence.text}`).join("|");
}

function remapLayersAfterAlignmentRerun(layers: Layer[], sentences: AlignedSentence[]): { changed: boolean; layers: Layer[] } {
  const sentenceByIndex = new Map(sentences.map((sentence) => [sentence.index, sentence] as const));
  let changed = false;
  const nextLayers = layers.map((layer) => {
    if (layer.kind === "fg") {
      let layerChanged = false;
      const nextItems: typeof layer.items = layer.items.map((item) => {
        if (!isSentenceAnchoredItem(item)) return item;
        const nextItem = remapSentenceAnchoredItem(item, sentenceByIndex);
        if (nextItem !== item) {
          changed = true;
          layerChanged = true;
        }
        return nextItem;
      });
      return layerChanged ? { ...layer, items: nextItems } : layer;
    }
    if (layer.kind === "pip") {
      let layerChanged = false;
      const nextItems: typeof layer.items = layer.items.map((item) => {
        if (!isSentenceAnchoredItem(item)) return item;
        const nextItem = remapSentenceAnchoredItem(item, sentenceByIndex);
        if (nextItem !== item) {
          changed = true;
          layerChanged = true;
        }
        return nextItem;
      });
      return layerChanged ? { ...layer, items: nextItems } : layer;
    }
    return layer;
  });
  return { changed, layers: nextLayers };
}

type SentenceAnchoredItem = {
  anchor?: "sentences" | "time";
  cache_status?: "warm" | "partial" | "cold" | "invalid" | "orphaned";
  end: number;
  orphan_reason?: string | null;
  orphaned?: boolean;
  sentences: [number, number];
  start: number;
};

function isSentenceAnchoredItem(value: unknown): value is SentenceAnchoredItem {
  return hasSentenceBounds(value) && hasTimeBounds(value);
}

function remapSentenceAnchoredItem<T extends SentenceAnchoredItem>(
  item: T,
  sentenceByIndex: ReadonlyMap<number, AlignedSentence>,
): T {
  if (item.anchor === "time") return item;
  const range = normalizeSentenceRange(item.sentences);
  const startSentence = sentenceByIndex.get(range[0]);
  const endSentence = sentenceByIndex.get(range[1]);
  const orphaned = !startSentence || !endSentence;
  const nextStart = startSentence?.start_s ?? item.start;
  const nextEnd = endSentence?.end_s ?? item.end;
  const nextOrphaned = orphaned ? true : item.orphaned === true ? false : item.orphaned;
  let nextOrphanReason = item.orphan_reason;
  if (orphaned) {
    nextOrphanReason = item.orphan_reason ?? "missing_sentence_anchor";
  } else if (item.orphan_reason != null) {
    nextOrphanReason = null;
  }
  const nextCacheStatus = orphaned
    ? "orphaned"
    : item.cache_status === "orphaned" || item.orphaned === true || item.orphan_reason
      ? "invalid"
      : item.cache_status;
  const changed =
    range[0] !== item.sentences[0] ||
    range[1] !== item.sentences[1] ||
    nextStart !== item.start ||
    nextEnd !== item.end ||
    nextOrphaned !== item.orphaned ||
    nextOrphanReason !== item.orphan_reason ||
    nextCacheStatus !== item.cache_status;
  if (!changed) return item;
  return {
    ...item,
    sentences: range,
    start: nextStart,
    end: nextEnd,
    orphaned: nextOrphaned,
    orphan_reason: nextOrphanReason,
    cache_status: nextCacheStatus,
  };
}

function promoteUploadedWatermarkAsset(entry: MediaAsset): MediaAsset {
  const nextKind = watermarkAssetKind(entry.kind);
  return withMediaRole({ ...entry, kind: nextKind }, "watermark");
}

function withMediaRole(entry: MediaAsset, role: MediaRole | undefined): MediaAsset {
  if (!role || entry.role === role) return entry;
  return { ...entry, role };
}

function roleForLayerKind(kind: Layer["kind"] | undefined): MediaRole | undefined {
  if (kind === "bg") return "background";
  if (kind === "fg") return "foreground";
  if (kind === "pip") return "pip";
  return undefined;
}

function isWatermarkConfigAsset(entry: Pick<MediaAsset, "kind" | "role">): boolean {
  return entry.role === "watermark" || entry.kind === "watermark_image" || entry.kind === "watermark_video";
}

function replaceWatermarkAssets(media: MediaAsset[], replacement: MediaAsset): MediaAsset[] {
  return [
    ...media.filter((entry) => !isWatermarkConfigAsset(entry)),
    replacement,
  ];
}

function watermarkForReplacement(
  watermark: Project["watermark"],
  mediaId: string,
): NonNullable<Project["watermark"]> {
  return watermark
    ? { ...watermark, mediaId }
    : { enabled: true, mediaId, opacity: 85, posX: 9, posY: 11, scale: 0.08 };
}

function promoteWatermarkSelection(media: MediaAsset[], watermark: Project["watermark"]): MediaAsset[] {
  const mediaId = watermark?.mediaId;
  if (!mediaId) return media;
  return media.map((entry) => {
    if (entry.id !== mediaId) return entry;
    const nextKind = watermarkAssetKind(entry.kind);
    return withMediaRole({ ...entry, kind: nextKind }, "watermark");
  });
}

function promoteWatermarkSelectionInEditorMedia(media: EditorMediaItem[], watermark: Project["watermark"]): EditorMediaItem[] {
  const mediaId = watermark?.mediaId;
  if (!mediaId) return media;
  return media.map((entry) => {
    if (entry.mediaId !== mediaId) return entry;
    const nextKind = watermarkEditorKind(entry.kind);
    return { ...entry, kind: nextKind, role: "watermark" };
  });
}

function watermarkAssetKind(kind: MediaAsset["kind"]): MediaAsset["kind"] {
  if (kind === "image") return "watermark_image";
  return kind;
}

function watermarkEditorKind(kind: EditorMediaItem["kind"]): EditorMediaItem["kind"] {
  if (kind === "image") return "watermark_image";
  return kind;
}

function isWatermarkImageFile(file: File): boolean {
  const acceptedMime = file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
  return acceptedMime || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isDeletableMediaAsset(entry: Pick<MediaAsset, "import_mode" | "path">): boolean {
  return entry.import_mode === "copy" && entry.path.startsWith("uploads/");
}

function mergeConfigMedia(existing: MediaAsset[], incoming: MediaAsset[]): MediaAsset[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function sameItemOrder<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function normalizeEditorMediaItems(
  items: EditorMediaItem[],
  layers: Layer[] = [],
  watermark: Project["watermark"] = null,
): EditorMediaItem[] {
  return items.map((entry) => {
    const normalized = {
      ...entry,
      mediaId: entry.mediaId || entry.filename,
      path: entry.path || "",
      import_mode: entry.import_mode ?? "copy",
      imported_at: entry.imported_at ?? new Date().toISOString(),
      importing: entry.importing ?? false,
      import_progress: entry.import_progress ?? null,
      import_error: entry.import_error ?? null,
      config_error: entry.config_error ?? null,
    };
    return {
      ...normalized,
      role: normalized.role ?? singleInferredMediaRole(mediaRolesForItem(normalized, layers, watermark)),
    };
  });
}

function toEditorMediaItemsFromConfig(
  configMedia: MediaAsset[],
  layers: Layer[] = [],
  watermark: Project["watermark"] = null,
): EditorMediaItem[] {
  const items = configMedia.map((entry) => {
    const thumbUrl = resolveThumbUrl(entry);
    const item: EditorMediaItem = {
      mediaId: entry.id,
      filename: entry.name || entry.id,
      kind: entry.kind,
      role: entry.role,
      deletable: isDeletableMediaAsset(entry),
      path: entry.path,
      thumb_path: entry.thumb_path ?? null,
      thumb_url: thumbUrl,
      width: entry.dimensions?.width ?? null,
      height: entry.dimensions?.height ?? null,
      duration: entry.duration ?? null,
      size: entry.size ?? 0,
      hash: entry.hash ?? null,
      import_mode: entry.import_mode,
      imported_at: entry.imported_at,
      created_at: entry.created_at ?? null,
      importing: false,
      import_progress: null,
      import_error: null,
      config_error: null,
    };
    return {
      ...item,
      role: item.role ?? singleInferredMediaRole(mediaRolesForItem(item, layers, watermark)),
    };
  });
  return [...items, ...missingConfigAssetPlaceholders(configMedia, layers, watermark)];
}

function collectConfigAssetIssues(
  configMedia: MediaAsset[],
  layers: Layer[],
  watermark: Project["watermark"],
): ConfigAssetIssue[] {
  const issues: ConfigAssetIssue[] = [];
  const seenIds = new Map<string, number>();
  const seenNames = new Map<string, number>();
  for (const entry of configMedia) {
    seenIds.set(entry.id, (seenIds.get(entry.id) ?? 0) + 1);
    seenNames.set(entry.name, (seenNames.get(entry.name) ?? 0) + 1);
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      issues.push({
        id: `duplicate-id:${id}`,
        message: `Ambiguous media asset id "${id}" appears ${count} times in project.media.`,
      });
    }
  }
  for (const [name, count] of seenNames) {
    if (count > 1) {
      issues.push({
        id: `duplicate-name:${name}`,
        message: `Ambiguous media asset name "${name}" appears ${count} times in project.media.`,
      });
    }
  }
  for (const reference of configAssetReferences(layers, watermark)) {
    const matches = matchingConfigMedia(configMedia, reference.mediaId);
    if (matches.length === 0) {
      issues.push({
        id: `missing:${reference.role}:${reference.source}:${reference.mediaId}`,
        message: `Missing ${configAssetRoleLabel(reference.role)} media asset "${reference.mediaId}" referenced by ${reference.source}.`,
      });
    } else if (matches.length > 1) {
      issues.push({
        id: `ambiguous:${reference.role}:${reference.source}:${reference.mediaId}`,
        message: `Ambiguous ${configAssetRoleLabel(reference.role)} media asset "${reference.mediaId}" referenced by ${reference.source}.`,
      });
    }
  }
  return dedupeConfigAssetIssues(issues);
}

function missingConfigAssetPlaceholders(
  configMedia: MediaAsset[],
  layers: Layer[],
  watermark: Project["watermark"],
): EditorMediaItem[] {
  const placeholders = new Map<string, EditorMediaItem>();
  for (const reference of configAssetReferences(layers, watermark)) {
    if (matchingConfigMedia(configMedia, reference.mediaId).length > 0 || placeholders.has(reference.mediaId)) continue;
    const message = `Config error: missing ${configAssetRoleLabel(reference.role)} media asset`;
    const placeholder: EditorMediaItem = {
      mediaId: reference.mediaId,
      filename: reference.mediaId,
      kind: "image",
      role: reference.role,
      path: "",
      thumb_url: "",
      width: null,
      height: null,
      duration: null,
      size: 0,
      hash: null,
      import_mode: "generated",
      imported_at: "",
      created_at: null,
      importing: false,
      import_progress: null,
      import_error: message,
      config_error: message,
      deletable: false,
    };
    placeholders.set(reference.mediaId, placeholder);
  }
  return [...placeholders.values()];
}

function configAssetReferences(layers: Layer[], watermark: Project["watermark"]): ConfigAssetReference[] {
  const references: ConfigAssetReference[] = [];
  for (const layer of layers) {
    const role = roleForLayerKind(layer.kind);
    if (!role) continue;
    layer.items.forEach((item, itemIndex) => {
      const mediaIds = mediaIdsForConfigItem(item);
      mediaIds.forEach((mediaId, mediaIndex) => {
        references.push({
          mediaId,
          role,
          source: configAssetSource(layer, item, itemIndex, mediaIds.length > 1 ? mediaIndex : null),
        });
      });
    });
  }
  if (watermark?.mediaId) {
    references.push({ mediaId: watermark.mediaId, role: "watermark", source: "watermark" });
  }
  return references;
}

function mediaIdsForConfigItem(item: unknown): string[] {
  if (!item || typeof item !== "object") return [];
  const candidate = item as { mediaId?: unknown; mediaIds?: unknown };
  const ids = Array.isArray(candidate.mediaIds) && candidate.mediaIds.length > 0
    ? candidate.mediaIds
    : [candidate.mediaId];
  return uniqueStrings(ids);
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function matchingConfigMedia(configMedia: MediaAsset[], mediaId: string): MediaAsset[] {
  return configMedia.filter((entry) => entry.id === mediaId || entry.name === mediaId);
}

function dedupeConfigAssetIssues(issues: ConfigAssetIssue[]): ConfigAssetIssue[] {
  const byId = new Map<string, ConfigAssetIssue>();
  for (const issue of issues) {
    byId.set(issue.id, issue);
  }
  return [...byId.values()];
}

function configAssetRoleLabel(role: MediaRole): string {
  if (role === "pip") return "PiP";
  return role;
}

function configAssetSource(layer: Layer, item: unknown, itemIndex: number, mediaIndex: number | null): string {
  const itemId = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
    ? (item as { id: string }).id
    : `item ${itemIndex + 1}`;
  const suffix = mediaIndex === null ? "" : ` media ${mediaIndex + 1}`;
  return `${layer.name || layer.id}/${itemId}${suffix}`;
}

type VisualEditorMediaItem = EditorMediaItem & { kind: "image" | "video" };

type ScopedEditorMedia = {
  background: VisualEditorMediaItem[];
  foreground: VisualEditorMediaItem[];
  pip: VisualEditorMediaItem[];
  visual: VisualEditorMediaItem[];
  watermark: EditorMediaItem[];
};

function scopeEditorMedia(
  media: EditorMediaItem[],
  layers: Layer[],
  watermark: Project["watermark"],
): ScopedEditorMedia {
  const scoped: ScopedEditorMedia = {
    background: [],
    foreground: [],
    pip: [],
    visual: [],
    watermark: [],
  };
  for (const item of media) {
    const roles = mediaRolesForItem(item, layers, watermark);
    const visual = isGenericVisualMedia(item) ? { ...item, role: item.role ?? singleInferredMediaRole(roles) } : null;
    if (visual) {
      scoped.visual.push(visual);
      if (roles.has("background")) scoped.background.push(visual);
      if (roles.has("foreground")) scoped.foreground.push(visual);
      if (roles.has("pip")) scoped.pip.push(visual);
    }
    if (roles.has("watermark")) {
      scoped.watermark.push({ ...item, role: "watermark" });
    }
  }
  return scoped;
}

function mediaRolesForItem(
  item: Pick<EditorMediaItem, "filename" | "kind" | "mediaId" | "role">,
  layers: Layer[],
  watermark: Project["watermark"],
): Set<MediaRole> {
  const roles = new Set<MediaRole>();
  if (item.role) roles.add(item.role);
  if (item.kind === "watermark_image" || item.kind === "watermark_video") roles.add("watermark");
  const ids = new Set([item.mediaId, item.filename].filter((value): value is string => Boolean(value)));
  if (watermark?.mediaId && ids.has(watermark.mediaId)) roles.add("watermark");
  for (const layer of layers) {
    const role = roleForLayerKind(layer.kind);
    if (!role) continue;
    const referenced = layer.items.some((candidate) => itemReferencesAnyMedia(candidate, ids));
    if (referenced) roles.add(role);
  }
  return roles;
}

function itemReferencesAnyMedia(item: unknown, mediaIds: ReadonlySet<string>): boolean {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { mediaId?: unknown; mediaIds?: unknown };
  if (typeof candidate.mediaId === "string" && mediaIds.has(candidate.mediaId)) return true;
  if (Array.isArray(candidate.mediaIds)) {
    return candidate.mediaIds.some((entry) => typeof entry === "string" && mediaIds.has(entry));
  }
  return false;
}

function isGenericVisualMedia(item: EditorMediaItem): item is VisualEditorMediaItem {
  return item.kind === "image" || item.kind === "video";
}

function singleInferredMediaRole(roles: ReadonlySet<MediaRole>): MediaRole | undefined {
  return roles.size === 1 ? roles.values().next().value : undefined;
}

function selectionExists(layers: Layer[], selection: NonNullable<EditorSelection>): boolean {
  return layers.some((layer) => layer.id === selection.layerId && layer.items.some((item) => {
    return Boolean(item && typeof item === "object" && (item as { id?: unknown }).id === selection.itemId);
  }));
}

function removeMediaReferencesFromLayers(layers: Layer[], mediaId: string): Layer[] {
  let changed = false;
  const nextLayers = layers.flatMap((layer): Layer[] => {
    if (layer.kind === "bg") {
      const nextItems = layer.items.flatMap((item) => {
        const candidate = item as typeof item & { mediaId?: string; mediaIds?: string[] };
        if (Array.isArray(candidate.mediaIds)) {
          const nextMediaIds = candidate.mediaIds.filter((entry) => entry !== mediaId);
          if (nextMediaIds.length === candidate.mediaIds.length && candidate.mediaId !== mediaId) return [item];
          changed = true;
          if (nextMediaIds.length === 0) return [];
          const nextItem = { ...item, mediaIds: nextMediaIds, cache_status: "invalid" as const };
          delete (nextItem as { mediaId?: string }).mediaId;
          return [nextItem];
        }
        if (candidate.mediaId === mediaId) {
          changed = true;
          return [];
        }
        return [item];
      });
      const layerChanged = nextItems.length !== layer.items.length || nextItems.some((item, index) => item !== layer.items[index]);
      if (!layerChanged) return [layer];
      if (nextItems.length === 0) return [];
      return [{ ...layer, items: nextItems }];
    }
    if (layer.kind === "fg" || layer.kind === "pip") {
      const nextItems = layer.items.filter((item) => (item as { mediaId?: string }).mediaId !== mediaId);
      if (nextItems.length === layer.items.length) return [layer];
      changed = true;
      if (nextItems.length === 0) return [];
      return [{ ...layer, items: nextItems } as Layer];
    }
    return [layer];
  });
  return changed ? nextLayers : layers;
}

function toAssignModalMedia(entry: VisualEditorMediaItem): {
  deletable?: boolean;
  filename: string;
  import_error?: string | null;
  import_progress?: number | null;
  importing?: boolean;
  kind: "image" | "video";
  mediaId: string;
  role?: "foreground" | "pip";
  thumb_url: string;
} {
  return {
    deletable: entry.deletable,
    filename: entry.filename,
    import_error: entry.import_error,
    import_progress: entry.import_progress,
    importing: entry.importing,
    kind: entry.kind,
    mediaId: entry.mediaId,
    role: entry.role === "foreground" || entry.role === "pip" ? entry.role : undefined,
    thumb_url: entry.thumb_url,
  };
}

function resolveThumbUrl(media: MediaAsset): string {
  if (!media.thumb_path) return "";
  const thumbName = PathFromUploadPath.fileName(media.thumb_path);
  if (!thumbName) return "";
  return `/uploads/thumb?filename=${encodeURIComponent(thumbName)}`;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_UPLOAD_BYTES = 9 * 1024 * 1024;
type UploadResponseEntry = { media: MediaAsset; mediaId: string };

function pendingKeyForFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function pendingMediaIdForFile(file: File): string {
  return `pending:${pendingKeyForFile(file)}`;
}

function pendingMediaItemFromFile(file: File, role?: MediaRole): EditorMediaItem {
  return {
    mediaId: pendingMediaIdForFile(file),
    filename: file.name,
    kind: inferMediaKindFromFile(file),
    role,
    path: "",
    thumb_path: null,
    thumb_url: "",
    width: null,
    height: null,
    duration: null,
    size: file.size,
    hash: null,
    import_mode: "copy",
    imported_at: new Date().toISOString(),
    created_at: null,
    importing: true,
    import_progress: 0,
    import_error: null,
  };
}

function mergePendingItem(existing: EditorMediaItem[], pending: EditorMediaItem): EditorMediaItem[] {
  const withoutSameId = existing.filter((entry) => entry.mediaId !== pending.mediaId);
  return [pending, ...withoutSameId];
}

function updatePendingImportState(
  existing: EditorMediaItem[],
  pendingId: string,
  patch: Partial<Pick<EditorMediaItem, "import_error" | "import_progress" | "importing">>,
): EditorMediaItem[] {
  return existing.map((entry) => {
    if (entry.mediaId !== pendingId) return entry;
    return { ...entry, ...patch };
  });
}

function mergeImportedMediaWithPending(imported: EditorMediaItem[], existing: EditorMediaItem[]): EditorMediaItem[] {
  const failures = existing.filter((entry) => entry.mediaId.startsWith("pending:") && !!entry.import_error);
  return [...failures, ...imported];
}

function inferMediaKindFromFile(file: File): EditorMediaItem["kind"] {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const ext = file.name.toLowerCase().split(".").at(-1) ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "rmvb", "flv"].includes(ext)) return "video";
  if (["wav", "mp3", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return "video";
}

async function uploadFileWithSplits(
  file: File,
  options: { onProgress: (value: number) => void },
): Promise<UploadResponseEntry[]> {
  if (file.size <= MAX_MULTIPART_UPLOAD_BYTES) {
    options.onProgress(100);
    return uploadSinglePart(file);
  }
  const chunks = chunkPlanForSize(file.size);
  const uploadId = pendingMediaIdForFile(file);
  let offset = 0;
  let response: UploadResponseEntry[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkSize = chunks[index] ?? 0;
    const nextOffset = Math.min(file.size, offset + chunkSize);
    const blob = file.slice(offset, nextOffset);
    const chunkFile = new File([blob], file.name, { type: file.type || "application/octet-stream" });
    response = await uploadChunk({
      chunkCount: chunks.length,
      chunkFile,
      chunkIndex: index,
      originalName: file.name,
      originalSize: file.size,
      uploadId,
    });
    offset = nextOffset;
    options.onProgress(Math.round((offset / file.size) * 100));
  }
  return response;
}

async function uploadSinglePart(file: File): Promise<UploadResponseEntry[]> {
  const body = new FormData();
  body.append("files", file);
  return request<UploadResponseEntry[]>("/uploads", { method: "POST", body });
}

function chunkPlanForSize(totalBytes: number): number[] {
  if (totalBytes <= MAX_MULTIPART_UPLOAD_BYTES) return [totalBytes];
  if (totalBytes <= MAX_MULTIPART_UPLOAD_BYTES * 2) {
    const first = Math.ceil(totalBytes / 2);
    return [first, totalBytes - first];
  }
  const chunks: number[] = [];
  let remaining = totalBytes;
  while (remaining > 0) {
    const part = Math.min(MAX_MULTIPART_UPLOAD_BYTES, remaining);
    chunks.push(part);
    remaining -= part;
  }
  return chunks;
}

async function uploadChunk(input: {
  chunkCount: number;
  chunkFile: File;
  chunkIndex: number;
  originalName: string;
  originalSize: number;
  uploadId: string;
}): Promise<UploadResponseEntry[]> {
  const body = new FormData();
  body.append("files", input.chunkFile);
  body.append("upload_id", input.uploadId);
  body.append("chunk_index", String(input.chunkIndex));
  body.append("chunk_count", String(input.chunkCount));
  body.append("original_name", input.originalName);
  body.append("original_size", String(input.originalSize));
  return request<UploadResponseEntry[]>("/uploads", { method: "POST", body });
}

function parseServerErrorMessage(error: unknown): string {
  if (error instanceof ServerRequestError) {
    const payload = error.payload as { error?: { code?: string; details?: Record<string, unknown>; message?: string } };
    const code = payload?.error?.code;
    if (code === "FILE_TOO_LARGE" || code === "CHUNK_TOO_LARGE") return "file exceeds 10 MiB chunk limit";
    if (code === "IMAGE_TOO_SMALL") return "image is smaller than 5x5";
    if (code === "CORRUPT_MEDIA") return "corrupt or unreadable media";
    if (code === "UNSUPPORTED_TYPE") return "unsupported file type";
    if (code === "THUMB_NOT_FOUND") return "thumbnail unavailable";
    return payload?.error?.message ?? `upload failed (${error.status})`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "upload failed";
}

const PathFromUploadPath = {
  fileName(value: string): string | null {
    const normalized = value.replace(/\\/g, "/").trim();
    const name = normalized.split("/").at(-1) ?? "";
    if (!name || name === "." || name === "..") return null;
    return name;
  },
};

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
