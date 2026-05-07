"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { TranscriptPanel } from "@/components/transcript-panel/TranscriptPanel";
import { useAlignment } from "@/lib/hooks/useAlignment";

type MediaItem = {
  filename: string;
  size: number;
  kind: "image" | "video";
  thumb_url: string;
};

type UploadEntry = {
  id: number;
  name: string;
  progress: number;
  error: string;
  done: boolean;
};

let _uid = 0;

function EditorContent() {
  const params = useSearchParams();
  const projectPath = params.get("project") ?? "";

  // Media state
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Alignment state
  const { state: alignState, selected, runAlignment, selectSentence } = useAlignment(projectPath);

  useEffect(() => {
    if (!projectPath) return;
    void fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  async function fetchMedia() {
    const r = await fetch(
      `/api/server/projects/media?project=${encodeURIComponent(projectPath)}`,
    );
    if (r.ok) setMedia((await r.json()) as MediaItem[]);
  }

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
        const items = JSON.parse(xhr.responseText) as MediaItem[];
        setMedia((prev) => [...prev, ...items]);
        patch({ progress: 100, done: true });
      } else {
        let msg = "Upload failed";
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          msg = body.error?.message ?? msg;
        } catch { /* keep default */ }
        patch({ error: msg });
      }
    });
    xhr.addEventListener("error", () => patch({ error: "Network error" }));
    xhr.open(
      "POST",
      `/api/server/projects/media?project=${encodeURIComponent(projectPath)}`,
    );
    xhr.send(fd);
  }

  const pending = uploads.filter((u) => !u.done && !u.error);
  const uploadErrors = uploads.filter((u) => u.error);

  if (!projectPath) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-2 px-6 py-10">
        <p className="text-sm opacity-70">No project open. Go to Launcher and open a project.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Editor</h1>
        <p className="mt-1 break-all font-mono text-xs opacity-40">{projectPath}</p>
      </header>

      {/* ── Media section ── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest opacity-40">Media</h2>

        <div
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragging
              ? "border-neutral-600 bg-neutral-100"
              : "border-neutral-300 hover:border-neutral-400"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            enqueueFiles(e.dataTransfer.files);
          }}
        >
          <p className="text-sm font-medium">Drop images or video here</p>
          <p className="mt-1 text-xs opacity-50">jpg · png · webp · mp4 · mov · webm</p>
        </div>
        <input
          accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
          className="hidden"
          multiple
          onChange={(e) => enqueueFiles(e.target.files)}
          ref={inputRef}
          type="file"
        />

        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            {pending.map((u) => (
              <div className="flex items-center gap-3 text-sm" key={u.id}>
                <span className="w-48 truncate opacity-70">{u.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-neutral-900 transition-all"
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums opacity-50">
                  {u.progress}%
                </span>
              </div>
            ))}
          </div>
        )}

        {uploadErrors.map((u) => (
          <p className="text-sm text-red-600" key={u.id}>
            {u.name}: {u.error}
          </p>
        ))}

        {media.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
            {media.map((item) => (
              <div className="flex flex-col gap-1" key={item.filename}>
                <div className="aspect-video overflow-hidden rounded bg-neutral-100">
                  {item.thumb_url ? (
                    <img
                      alt={item.filename}
                      className="h-full w-full object-cover"
                      src={`/api/server${item.thumb_url}`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-lg opacity-20">
                      {item.kind === "video" ? "▶" : "□"}
                    </div>
                  )}
                </div>
                <p className="truncate text-xs opacity-60" title={item.filename}>
                  {item.filename}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Transcript / Alignment section ── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest opacity-40">Transcript</h2>
          <div className="flex items-center gap-3">
            {alignState.status === "done" && (
              <button
                className="text-xs opacity-50 hover:opacity-80"
                onClick={() => void runAlignment(true)}
                type="button"
              >
                Re-run
              </button>
            )}
            {alignState.status !== "loading" && (
              <button
                className="rounded bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={alignState.status === "loading"}
                onClick={() => void runAlignment()}
                type="button"
              >
                Run Alignment
              </button>
            )}
            {alignState.status === "loading" && (
              <span className="text-xs opacity-60">Aligning…</span>
            )}
          </div>
        </div>

        {alignState.status === "idle" && (
          <p className="text-sm opacity-50">
            No alignment yet. Add a voice file and transcript, then click Run Alignment.
          </p>
        )}

        {alignState.status === "error" && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {alignState.message}
          </p>
        )}

        {alignState.status === "loading" && (
          <div className="flex items-center gap-2 text-sm opacity-60">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
            Running forced alignment…
          </div>
        )}

        {alignState.status === "done" && (
          <>
            {alignState.result.cache_hit && (
              <p className="text-xs opacity-40">Loaded from cache.</p>
            )}
            {selected.size > 0 && (
              <p className="text-xs opacity-50">{selected.size} sentence{selected.size !== 1 ? "s" : ""} selected</p>
            )}
            <TranscriptPanel
              onSelect={selectSentence}
              result={alignState.result}
              selected={selected}
            />
          </>
        )}
      </section>
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
