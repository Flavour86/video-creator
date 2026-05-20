"use client";

import { KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MediaAsset, Project, ProjectConfigLoadResponse, ProjectConfigSaveResponse, TranscriptSentenceCue } from "@vc/shared-schemas";
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
import type { EditorMediaItem, EditorModal as EditorModalKind, EditorRenderJob, EditorSelection } from "@/components/editor/types";
import { Button } from "@/components/ui";
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
import { deleteVisualItem, hasSentenceOverlap, patchBackgroundItems, patchVisualItem } from "@/lib/layers";
import type { Layer } from "@/lib/preview/resolveDisplay";
import { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";

type BgLayer = Extract<Layer, { kind: "bg" }>;
type ClipLayer = Extract<Layer, { kind: "fg" | "pip" }>;

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
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (isTextEditingTarget(target)) {
    return true;
  }
  return Boolean(
    target.closest(
      "button, a[href], summary, [role='button'], [role='link'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [contenteditable]:not([contenteditable='false'])",
    ),
  );
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
  const [resolution, setResolution] = useState<"1080p" | "720p" | "9:16">("1080p");
  const [modal, setModal] = useState<EditorModalKind>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [renderJob, setRenderJob] = useState<EditorRenderJob>({ phase: "", progress: 0, running: false, status: "idle" });
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

  const alignmentSentences = useMemo(() => alignmentState.status === "done" ? alignmentState.result.sentences : [], [alignmentState]);
  const [sentences, setSentences] = useState<AlignedSentence[]>([]);
  const duration = sentences.at(-1)?.end_s ?? 0;
  const timelineDuration = duration;
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
  const visualMedia = useMemo(
    () =>
      media.filter(
        (
          entry,
        ): entry is EditorMediaItem & { kind: "image" | "video" } => entry.kind === "image" || entry.kind === "video",
      ),
    [media],
  );

  const loadProject = useCallback(async (id: string) => {
    try {
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
      const configMedia = toEditorMediaItemsFromConfig(workingConfig.media ?? []);
      setMedia(normalizeEditorMediaItems(configMedia));
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
        media: project.media,
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
    if (!project) return;
    const previousLayers = layers;
    setLayers(updatedLayers);
    setProject({ ...project, layers: updatedLayers as Project["layers"] });
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
    setSelectedSentenceRange(nextRange);
    seekTo(boundedStart);
  }, [applyLayerMutation, layers, seekTo, sentences, timelineDuration]);

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
    if (!project) return;
    const previousWatermark = project.watermark;
    setProject({ ...project, watermark: nextWatermark });
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

  const importMedia = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !project) return;
    const incoming = Array.from(files);
    const uploaded: MediaAsset[] = [];
    const pendingIds = new Map<string, string>();
    setMedia((previous) => {
      let next = previous;
      for (const file of incoming) {
        const pending = pendingMediaItemFromFile(file);
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
    if (uploaded.length === 0) return;
    const nextConfigMedia = mergeConfigMedia(project.media ?? [], uploaded);
    const nextEditorMedia = toEditorMediaItemsFromConfig(nextConfigMedia);
    setProject({ ...project, media: nextConfigMedia });
    setMedia((previous) => mergeImportedMediaWithPending(nextEditorMedia, previous));
    setHasUnrenderedChanges(true);
    setSaveStatus("pending");
  }, [project]);

  if (!projectId) {
    return (
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">{t("noProject")}</p>
        <Button onClick={() => router.push("/")} variant="primary">{t("goLauncher")}</Button>
      </PageChrome>
    );
  }

  return (
    <PageChrome className="grid min-h-0 grid-rows-[48px_auto_minmax(0,1fr)] overflow-y-auto lg:overflow-hidden" variant="workbench">
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
          onSeek={seekTo}
          onScrollPositionChange={onTranscriptScroll}
          onSelectRange={setSelectedSentenceRange}
          query={query}
          scrollContainerRef={transcriptScrollRef}
          searchInputRef={searchInputRef}
          selectedRange={selectedSentenceRange}
          sentences={sentences}
        />
        <main className="flex min-h-0 min-w-0 flex-col bg-(--bg-0)" data-testid="editor-center-pane">
          <div className="flex min-h-0 flex-1 flex-col" data-testid="preview-stack">
            <PreviewSurface
              currentTime={currentTime}
              duration={duration}
              layers={layers}
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
                onAdd={() => {
                  setAssignEdit(null);
                  setModal("upload");
                }}
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
          />
        </main>
        <Inspector
          layers={layers}
          media={media}
          onDeleteItem={deleteInspectorItem}
          onOpenAssignEdit={openAssignEdit}
          onOpenBackground={() => setModal("background")}
          onOpenSubtitles={() => setModal("subtitles")}
          onPatchBackground={patchInspectorBackground}
          onPatchItem={patchInspectorItem}
          onRemoveBackground={removeBackgroundLayer}
          onUpdateRange={patchInspectorRange}
          onWatermarkChange={applyWatermarkSettings}
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
          media={visualMedia.map((entry) => ({ filename: entry.filename, kind: entry.kind, thumb_url: entry.thumb_url }))}
          onClose={() => setModal(null)}
          onImport={importMedia}
          onConfirm={applyAssignedLayers}
          open
          sentences={sentences}
          toSentence={assignRange[1]}
        />
      ) : modal === "background" ? (
        <BgModal
          duration={duration}
          existing={(layers.find((layer) => layer.kind === "bg") as BgLayer | undefined)}
          media={visualMedia.map((entry) => ({
            duration: entry.duration,
            filename: entry.filename,
            import_error: entry.import_error,
            importing: entry.importing,
            kind: entry.kind,
            mediaId: entry.mediaId,
            thumb_url: entry.thumb_url,
          }))}
          onClose={() => setModal(null)}
          onImport={importMedia}
          onSave={applyBackgroundLayer}
          open
          totalSentences={sentences.length}
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

function hasVisualItemId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
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
  return normalized;
}

function mergeConfigMedia(existing: MediaAsset[], incoming: MediaAsset[]): MediaAsset[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function normalizeEditorMediaItems(items: EditorMediaItem[]): EditorMediaItem[] {
  return items.map((entry) => ({
    ...entry,
    mediaId: entry.mediaId || entry.filename,
    path: entry.path || "",
    import_mode: entry.import_mode ?? "copy",
    imported_at: entry.imported_at ?? new Date().toISOString(),
    importing: entry.importing ?? false,
    import_progress: entry.import_progress ?? null,
    import_error: entry.import_error ?? null,
  }));
}

function toEditorMediaItemsFromConfig(configMedia: MediaAsset[]): EditorMediaItem[] {
  return configMedia.map((entry) => {
    const thumbUrl = resolveThumbUrl(entry);
    return {
      mediaId: entry.id,
      filename: entry.name || entry.id,
      kind: entry.kind,
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
    };
  });
}

function resolveThumbUrl(media: MediaAsset): string {
  if (!media.thumb_path) return "";
  const thumbName = PathFromUploadPath.fileName(media.thumb_path);
  if (!thumbName) return "";
  return `/uploads/thumb?filename=${encodeURIComponent(thumbName)}`;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
type UploadResponseEntry = { media: MediaAsset; mediaId: string };

function pendingKeyForFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function pendingMediaIdForFile(file: File): string {
  return `pending:${pendingKeyForFile(file)}`;
}

function pendingMediaItemFromFile(file: File): EditorMediaItem {
  return {
    mediaId: pendingMediaIdForFile(file),
    filename: file.name,
    kind: inferMediaKindFromFile(file),
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
  if (file.size <= MAX_UPLOAD_BYTES) {
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
  if (totalBytes <= MAX_UPLOAD_BYTES) return [totalBytes];
  if (totalBytes <= MAX_UPLOAD_BYTES * 2) {
    const first = Math.ceil(totalBytes / 2);
    return [first, totalBytes - first];
  }
  const chunks: number[] = [];
  let remaining = totalBytes;
  while (remaining > 0) {
    const part = Math.min(MAX_UPLOAD_BYTES, remaining);
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
