"use client";

import { KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Project } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { EditorBar } from "@/components/editor/EditorBar";
import { EditorModal } from "@/components/editor/EditorModal";
import { Inspector } from "@/components/editor/Inspector";
import { LayersPopover } from "@/components/editor/LayersPopover";
import { PreviewControls } from "@/components/editor/PreviewControls";
import { PreviewSurface } from "@/components/editor/PreviewSurface";
import { Timeline } from "@/components/editor/Timeline";
import { TranscriptPane } from "@/components/editor/TranscriptPane";
import type { EditorMediaItem, EditorModal as EditorModalKind, EditorRenderJob, EditorSelection } from "@/components/editor/types";
import { Button } from "@/components/ui";
import { request } from "@/lib/api/server";
import { useAlignment } from "@/lib/hooks/useAlignment";
import type { Layer } from "@/lib/preview/resolveDisplay";

function EditorContent() {
  const t = useTranslations("pages.editor");
  const router = useRouter();
  const params = useSearchParams();
  const projectPath = params.get("project") ?? "";
  const { state: alignmentState } = useAlignment(projectPath);
  const [projectName, setProjectName] = useState("test01");
  const [audioFile, setAudioFile] = useState("");
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
  const [renderJob, setRenderJob] = useState<EditorRenderJob>({ phase: "", progress: 0, running: false });
  const [assignRange, setAssignRange] = useState<[number, number]>([1, 1]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const loadProject = useCallback(async (path: string) => {
    try {
      const [project, mediaItems] = await Promise.all([
        request<Project>(`/projects/load?project=${encodeURIComponent(path)}` as `/${string}`),
        request<EditorMediaItem[]>(`/projects/media?project=${encodeURIComponent(path)}` as `/${string}`),
      ]);
      setProjectName(project.name ?? path.split(/[\\/]/).pop() ?? "Project");
      setAudioFile(project.audio ?? "");
      setLayers((project.layers ?? []) as Layer[]);
      setMedia(mediaItems);
      const firstSelectable = (project.layers ?? []).flatMap((layer) => layer.kind === "sub" ? [] : layer.items.map((item) => ({ item, layer }))).find(({ item }) => "id" in item);
      if (firstSelectable && "id" in firstSelectable.item) {
        setSelected({ layerId: firstSelectable.layer.id, itemId: firstSelectable.item.id });
      }
    } catch {
      setProjectName(path.split(/[\\/]/).pop() ?? "Project");
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
    if (!projectPath) return;
    void loadProject(projectPath);
  }, [loadProject, projectPath]);

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
    try {
      await request(`/projects/layers?project=${encodeURIComponent(projectPath)}` as `/${string}`, { method: "PUT", body: { layers } });
    } finally {
      setSaving(false);
    }
  }, [layers, projectPath]);

  const renderDraft = useCallback(async () => {
    setRenderJob({ phase: "verifying cache", progress: 12, running: true });
    try {
      const result = await request<{ render_id: string }>(`/projects/render?project=${encodeURIComponent(projectPath)}` as `/${string}`, { method: "POST", body: { preset: "draft" } });
      setRenderJob({ phase: result.render_id, progress: 100, running: false });
    } catch {
      setRenderJob({ phase: "failed", progress: 0, running: false });
    }
  }, [projectPath]);

  const renderFinal = useCallback(async () => {
    try {
      const result = await request<{ render_id: string }>(`/projects/render?project=${encodeURIComponent(projectPath)}` as `/${string}`, { method: "POST", body: { preset: "final" } });
      router.push(`/render?project=${encodeURIComponent(projectPath)}&job=${encodeURIComponent(result.render_id)}`);
      return;
    } catch {
      // Render screen shows final status.
    }
    router.push(`/render?project=${encodeURIComponent(projectPath)}`);
  }, [projectPath, router]);

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

  if (!projectPath) {
    return (
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">{t("noProject")}</p>
        <Button onClick={() => router.push("/")} variant="primary">{t("goLauncher")}</Button>
      </PageChrome>
    );
  }

  return (
    <PageChrome className="grid h-[calc(100vh-44px-40px)] grid-rows-[48px_1fr] overflow-hidden">
      <EditorBar
        cacheLabel={cacheLabel}
        onChangeBackground={() => setModal("background")}
        onOpenFolder={() => void request("/system/reveal", { method: "POST", body: { path: projectPath } })}
        onRenderDraft={renderDraft}
        onRenderFinal={renderFinal}
        onSave={() => void saveNow()}
        onSubtitles={() => setModal("subtitles")}
        projectName={projectName}
        projectPath={projectPath}
        renderJob={renderJob}
        saving={saving}
      />
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
          renderJob={renderJob}
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
      {audioFile ? (
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

export default function EditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}
