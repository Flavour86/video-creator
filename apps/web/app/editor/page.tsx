"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clapperboard, Film } from "lucide-react";

import { AssignModal } from "@/components/assign-modal/AssignModal";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { BgModal } from "@/components/bg-modal/BgModal";
import { InspectorPanel } from "@/components/inspector/InspectorPanel";
import { LayersPopover } from "@/components/layers-popover/LayersPopover";
import { PreviewPlayer } from "@/components/preview-player/PreviewPlayer";
import { RenderDraftBar } from "@/components/render-draft-bar/RenderDraftBar";
import { RenderHistory } from "@/components/render-history/RenderHistory";
import { SubtitleToggle } from "@/components/subtitle-toggle/SubtitleToggle";
import { Waveform } from "@/components/preview-player/Waveform";
import { Timeline } from "@/components/timeline/Timeline";
import { TranscriptPanel } from "@/components/transcript-panel/TranscriptPanel";
import { Button } from "@/components/ui";
import { WatermarkPanel } from "@/components/watermark-panel/WatermarkPanel";
import { useAlignment } from "@/lib/hooks/useAlignment";
import { useAssignModal } from "@/lib/hooks/useAssignModal";
import { useProject } from "@/lib/hooks/useProject";
import { useRenderProgress } from "@/lib/hooks/useRenderProgress";
import type { Layer } from "@/lib/preview/resolveDisplay";

type MediaItem = {
  filename: string;
  size: number;
  kind: "image" | "video";
  thumb_url: string;
};

type UploadEntry = { id: number; name: string; progress: number; error: string; done: boolean };

let _uid = 0;

function EditorContent() {
  const params = useSearchParams();
  const projectPath = params.get("project") ?? "";

  // Project store
  const {
    layers, subtitles, watermark, sentences, duration,
    selectedLayerId, selectedItemId,
    setProjectPath, setLayers, setSubtitles, setWatermark, setSentences, setDuration,
    setSelectedItem, saveLayers, saveSubtitles, saveWatermark,
  } = useProject();

  // Assign modal store
  const { isOpen: assignOpen, fromSentence, toSentence, editItemId, editLayerId, close: closeAssign, openForSentence, openForEdit } = useAssignModal();

  // Media
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Playback
  const [currentTime, setCurrentTime] = useState(0);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const handleTimeUpdate = useCallback((t: number) => setCurrentTime(t), []);
  const handleDurationReady = useCallback((d: number) => setDuration(d), [setDuration]);

  // Alignment
  const { state: alignState, selected, runAlignment, selectSentence } = useAlignment(projectPath);
  const renderProgress = useRenderProgress(projectPath);

  // Audio URL for waveform
  const audioFilename = "voice.wav";
  const audioUrl = projectPath
    ? `/api/server/projects/audio?project=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(audioFilename)}`
    : "";

  // On mount: load project data, media, and alignment
  useEffect(() => {
    if (!projectPath) return;
    setProjectPath(projectPath);
    void loadProjectData();
    void loadMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  // Sync sentences from alignment into project store
  useEffect(() => {
    if (alignState.status === "done") setSentences(alignState.result.sentences);
  }, [alignState, setSentences]);

  async function loadProjectData() {
    const r = await fetch(
      `/api/server/projects/load?project=${encodeURIComponent(projectPath)}`,
    );
    if (r.ok) {
      const data = (await r.json()) as {
        layers?: Layer[];
        subtitles?: Parameters<typeof setSubtitles>[0];
        watermark?: Parameters<typeof setWatermark>[0];
      };
      if (Array.isArray(data.layers)) setLayers(data.layers);
      setSubtitles(data.subtitles);
      setWatermark(data.watermark);
    }
  }

  async function loadMedia() {
    const r = await fetch(
      `/api/server/projects/media?project=${encodeURIComponent(projectPath)}`,
    );
    if (r.ok) setMedia((await r.json()) as MediaItem[]);
  }

  // BG modal save
  async function handleBgSave(bgLayer: Extract<Layer, { kind: "bg" }>) {
    const withoutBg = layers.filter((l) => l.kind !== "bg");
    const newLayers = [...withoutBg, bgLayer as Layer];
    await saveLayers(newLayers);
  }

  // Assign modal confirm
  async function handleAssignConfirm(updatedLayers: Layer[], newLayerId: string, newItemId: string) {
    await saveLayers(updatedLayers);
    setSelectedItem(newLayerId, newItemId);
  }

  // Inspector changes
  async function handleLayersChange(updatedLayers: Layer[]) {
    await saveLayers(updatedLayers);
  }

  // Layers popover: delete a layer
  async function handleDeleteLayer(layerId: string) {
    const updated = layers.filter((l) => l.id !== layerId);
    await saveLayers(updated);
    if (selectedLayerId === layerId) setSelectedItem(null, null);
  }

  const existingBg = layers.find((l) => l.kind === "bg") as Extract<Layer, { kind: "bg" }> | undefined;
  const draftLabel = renderProgress.isActive
    ? `Drafting ${Math.round(renderProgress.percent)}%`
    : "Render Draft";

  // File upload
  function enqueueFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((file) => {
      const id = ++_uid;
      setUploads((prev) => [...prev, { id, name: file.name, progress: 0, error: "", done: false }]);
      uploadOne(file, id);
    });
  }

  function uploadOne(file: File, id: number) {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("files", file);

    function patch(delta: Partial<UploadEntry>) {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...delta } : u)));
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) patch({ progress: Math.round((e.loaded / e.total) * 100) });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setMedia((prev) => [...prev, ...(JSON.parse(xhr.responseText) as MediaItem[])]);
        patch({ progress: 100, done: true });
      } else {
        let msg = "Add failed";
        try { msg = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? msg; } catch { /* keep */ }
        patch({ error: msg });
      }
    });
    xhr.addEventListener("error", () => patch({ error: "Network error" }));
    xhr.open("POST", `/api/server/projects/media?project=${encodeURIComponent(projectPath)}`);
    xhr.send(fd);
  }

  const pendingUploads = uploads.filter((u) => !u.done && !u.error);

  if (!projectPath) {
    return (
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">No project open. Go to Launcher and open a project.</p>
      </PageChrome>
    );
  }

  return (
    <PageChrome variant="workbench">
      <div className="flex shrink-0 items-center justify-between border-b border-(--line) bg-(--bg-1) px-(--space-5) py-(--space-3)">
        <p className="vc-type-mono-meta min-w-0 max-w-[42vw] truncate text-(--text-3)" title={projectPath}>
          {projectPath}
        </p>
        <div className="flex shrink-0 items-center gap-(--space-2)">
          <Button
            disabled={renderProgress.isActive}
            onClick={() => void renderProgress.startDraft()}
            size="extra-small"
            variant="render"
          >
            <Clapperboard size={14} />
            {draftLabel}
          </Button>
          <Link
            className="vc-type-caption inline-flex h-(--space-8) items-center gap-(--space-2) rounded-(--r-sm) border border-(--line) bg-(--bg-2) px-(--space-3) font-semibold text-(--text) transition-colors hover:bg-(--bg-3) focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--blue)"
            href={`/render?project=${encodeURIComponent(projectPath)}`}
          >
            <Film size={14} />
            Render Final
          </Link>
          <LayersPopover
            layers={layers}
            onAddItem={() => openForSentence(sentences[0]?.index ?? 1)}
            onDeleteLayer={(id) => void handleDeleteLayer(id)}
            onSelectItem={(lid, iid) => setSelectedItem(lid, iid)}
            selectedItemId={selectedItemId}
            selectedLayerId={selectedLayerId}
          />
          <BgModal
            duration={duration}
            existing={existingBg}
            media={media}
            onSave={(layer) => void handleBgSave(layer as Extract<Layer, { kind: "bg" }>)}
            totalSentences={sentences.length}
          >
            <Button size="extra-small" variant="default">
              {existingBg ? "Change BG" : "Add BG"}
            </Button>
          </BgModal>
        </div>
      </div>
      <RenderDraftBar
        onCancel={() => void renderProgress.cancel()}
        projectPath={projectPath}
        state={renderProgress.state}
      />

      {/* ── Main area ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: preview + waveform + timeline */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* Preview */}
          <PreviewPlayer
            currentTime={currentTime}
            layers={layers}
            projectPath={projectPath}
            sentences={sentences}
            watermark={watermark}
          />

          {/* Waveform */}
          <Waveform
            activeSentenceIndex={
              alignState.status === "done"
                ? alignState.result.sentences.find(
                    (s) => s.start_s <= currentTime && currentTime < s.end_s,
                  )?.index
                : undefined
            }
            audioUrl={audioUrl}
            onDurationReady={handleDurationReady}
            onTimeUpdate={handleTimeUpdate}
            seekToTime={seekToTime}
            sentences={alignState.status === "done" ? alignState.result.sentences : []}
          />

          {/* Timeline */}
          <Timeline
            currentTime={currentTime}
            duration={duration}
            layers={layers}
            onSeek={(t) => setSeekToTime(t)}
            onSelectItem={(lid, iid) => setSelectedItem(lid, iid)}
            projectPath={projectPath}
            selectedItemId={selectedItemId}
            selectedLayerId={selectedLayerId}
            sentences={sentences}
          />

          {/* Media drop zone (collapsed) */}
          <details className="rounded-(--r) border border-(--line)">
            <summary className="vc-type-eyebrow cursor-pointer px-(--space-3) py-(--space-3) text-(--text-3) transition-colors hover:bg-(--bg-2) hover:text-(--text)">
              Media ({media.length})
            </summary>
            <div className="p-(--space-3)">
              <div
                className="vc-drop-zone vc-type-caption flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-(--r) p-(--space-8) text-(--text-2)"
                data-state={dragging ? "active" : "idle"}
                onClick={() => inputRef.current?.click()}
                onDragLeave={() => setDragging(false)}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); enqueueFiles(e.dataTransfer.files); }}
              >
                Add images / video here - jpg png webp mp4 mov webm
              </div>
              <input accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" className="hidden" multiple onChange={(e) => enqueueFiles(e.target.files)} ref={inputRef} type="file" />
              {pendingUploads.map((u) => (
                <div className="mt-(--space-2) flex items-center gap-(--space-2)" key={u.id}>
                  <span className="vc-type-caption w-32 truncate text-(--text-3)">{u.name}</span>
                  <div className="h-(--space-1) flex-1 overflow-hidden rounded-(--r-pill) bg-(--bg-3)">
                    <div className="h-full rounded-(--r-pill) bg-(--amber) transition-all" style={{ width: `${u.progress}%` }} />
                  </div>
                </div>
              ))}
              {media.length > 0 && (
                <div className="mt-(--space-3) grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-(--space-2)">
                  {media.map((item) => (
                    <div className="flex flex-col gap-(--space-1)" key={item.filename}>
                      <div className="aspect-video overflow-hidden rounded-(--r-sm) bg-(--bg-3)">
                        {item.thumb_url ? (
                          <img alt={item.filename} className="h-full w-full object-cover" src={`/api/server${item.thumb_url}`} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs opacity-20">{item.kind === "video" ? "▶" : "□"}</div>
                        )}
                      </div>
                      <p className="vc-type-caption truncate opacity-50" title={item.filename}>{item.filename}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Right: inspector + transcript panel */}
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-200 p-3">
          {/* Inspector — only when an item is selected */}
          <InspectorPanel
            layers={layers}
            media={media}
            onDeselect={() => setSelectedItem(null, null)}
            onLayersChange={(updated) => void handleLayersChange(updated)}
            onOpenAssignEdit={(lid, iid, from, to) => openForEdit(lid, iid, from, to)}
            projectPath={projectPath}
            selectedItemId={selectedItemId}
            selectedLayerId={selectedLayerId}
            sentences={sentences}
          />

          <RenderHistory
            projectPath={projectPath}
            refreshKey={renderProgress.state.status === "done" ? renderProgress.state.renderId : ""}
          />

          <SubtitleToggle
            burnIn={subtitles.burn_in}
            disabled={renderProgress.isActive}
            onChange={(burnIn) => void saveSubtitles(burnIn)}
          />

          <WatermarkPanel
            media={media}
            onChange={(next) => void saveWatermark(next)}
            value={watermark}
          />

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest opacity-40">Transcript</h2>
            <div className="flex gap-2">
              {alignState.status === "done" && (
                <button className="text-xs opacity-40 hover:opacity-80" onClick={() => void runAlignment(true)} type="button">
                  Re-run
                </button>
              )}
              {alignState.status !== "loading" && (
                <button
                  className="rounded bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-white"
                  onClick={() => void runAlignment()}
                  type="button"
                >
                  Align
                </button>
              )}
              {alignState.status === "loading" && (
                <span className="text-xs opacity-50">Aligning…</span>
              )}
            </div>
          </div>

          {alignState.status === "idle" && (
            <p className="text-xs opacity-40">No alignment yet.</p>
          )}
          {alignState.status === "error" && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-600">{alignState.message}</p>
          )}
          {alignState.status === "loading" && (
            <div className="flex items-center gap-2 text-xs opacity-50">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
              Running…
            </div>
          )}
          {alignState.status === "done" && (
            <div className="min-h-0 flex-1 overflow-hidden">
              {selected.size > 0 && (
                <p className="mb-1 text-xs opacity-40">{selected.size} selected</p>
              )}
              <TranscriptPanel
                currentTime={currentTime}
                onSeek={(t) => setSeekToTime(t)}
                onSelect={selectSentence}
                result={alignState.result}
                selected={selected}
              />
            </div>
          )}
        </div>
      </div>
      {/* AssignModal — controlled by useAssignModal store */}
      <AssignModal
        editItemId={editItemId}
        editLayerId={editLayerId}
        fromSentence={fromSentence}
        layers={layers}
        media={media}
        onClose={closeAssign}
        onConfirm={(updated, lid, iid) => void handleAssignConfirm(updated, lid, iid)}
        open={assignOpen}
        sentences={sentences}
        toSentence={toSentence}
      />
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
