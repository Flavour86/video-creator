"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BgModal } from "@/components/bg-modal/BgModal";
import { PreviewPlayer } from "@/components/preview-player/PreviewPlayer";
import { Waveform } from "@/components/preview-player/Waveform";
import { Timeline } from "@/components/timeline/Timeline";
import { TranscriptPanel } from "@/components/transcript-panel/TranscriptPanel";
import { useAlignment } from "@/lib/hooks/useAlignment";
import { useProject } from "@/lib/hooks/useProject";
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
  const { layers, sentences, duration, setProjectPath, setLayers, setSentences, setDuration, saveLayers } =
    useProject();

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
      const data = (await r.json()) as { layers?: Layer[] };
      if (Array.isArray(data.layers)) setLayers(data.layers);
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

  const existingBg = layers.find((l) => l.kind === "bg") as Extract<Layer, { kind: "bg" }> | undefined;

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
        let msg = "Upload failed";
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
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <p className="text-sm opacity-60">No project open. Go to Launcher and open a project.</p>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-45px)] flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <p className="max-w-xs truncate font-mono text-xs opacity-40">{projectPath}</p>
        <div className="flex items-center gap-2">
          <BgModal
            duration={duration}
            existing={existingBg}
            media={media}
            onSave={(layer) => void handleBgSave(layer as Extract<Layer, { kind: "bg" }>)}
            totalSentences={sentences.length}
          >
            <button
              className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
              type="button"
            >
              {existingBg ? "Change BG" : "Add BG"}
            </button>
          </BgModal>
        </div>
      </div>

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
            projectPath={projectPath}
            sentences={sentences}
          />

          {/* Media drop zone (collapsed) */}
          <details className="rounded-lg border border-neutral-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-widest opacity-40 hover:opacity-70">
              Media ({media.length})
            </summary>
            <div className="p-3">
              <div
                className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-4 text-xs transition-colors ${
                  dragging ? "border-neutral-600 bg-neutral-100" : "border-neutral-300 hover:border-neutral-400"
                }`}
                onClick={() => inputRef.current?.click()}
                onDragLeave={() => setDragging(false)}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); enqueueFiles(e.dataTransfer.files); }}
              >
                Drop images / video here · jpg png webp mp4 mov webm
              </div>
              <input accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" className="hidden" multiple onChange={(e) => enqueueFiles(e.target.files)} ref={inputRef} type="file" />
              {pendingUploads.map((u) => (
                <div className="mt-2 flex items-center gap-2 text-xs" key={u.id}>
                  <span className="w-32 truncate opacity-60">{u.name}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${u.progress}%` }} />
                  </div>
                </div>
              ))}
              {media.length > 0 && (
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                  {media.map((item) => (
                    <div className="flex flex-col gap-0.5" key={item.filename}>
                      <div className="aspect-video overflow-hidden rounded bg-neutral-100">
                        {item.thumb_url ? (
                          <img alt={item.filename} className="h-full w-full object-cover" src={`/api/server${item.thumb_url}`} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs opacity-20">{item.kind === "video" ? "▶" : "□"}</div>
                        )}
                      </div>
                      <p className="truncate text-[10px] opacity-50" title={item.filename}>{item.filename}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Right: transcript panel */}
        <div className="flex w-72 shrink-0 flex-col gap-3 border-l border-neutral-200 p-3">
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
    </main>
  );
}

export default function EditorPage() {
  return (
    <Suspense>
      <EditorContent />
    </Suspense>
  );
}
