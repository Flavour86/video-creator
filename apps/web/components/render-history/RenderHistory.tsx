"use client";

import { FolderOpen, History, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type RenderHistoryItem = {
  id: string;
  output_path: string;
  preset: string;
  started_at: string;
  finished_at: string | null;
  duration_s: number | null;
  status: string;
  message: string | null;
  file_size: number;
};

type Props = {
  projectPath: string;
  refreshKey?: string;
};

export function RenderHistory({ projectPath, refreshKey = "" }: Props) {
  const [rows, setRows] = useState<RenderHistoryItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, refreshKey, showAll]);

  async function load() {
    setIsLoading(true);
    try {
      const limit = showAll ? 500 : 10;
      const response = await fetch(
        `/api/server/projects/renders?project=${encodeURIComponent(projectPath)}&limit=${limit}`,
      );
      if (response.ok) {
        setRows((await response.json()) as RenderHistoryItem[]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function reveal(renderId: string) {
    await fetch(
      `/api/server/projects/renders/${encodeURIComponent(renderId)}/reveal?project=${encodeURIComponent(projectPath)}`,
      { method: "POST" },
    );
  }

  return (
    <section className="border-b border-neutral-200 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest opacity-40">
          <History size={13} />
          Renders
        </h2>
        <button
          aria-label="Refresh renders"
          className="rounded p-1 opacity-40 hover:bg-neutral-100 hover:opacity-80"
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={13} />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs opacity-40">No renders yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border border-neutral-200 px-2 py-1.5"
              key={row.id}
            >
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                {row.preset}
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px]" title={row.output_path}>
                  {row.output_path}
                </p>
                <p className="text-[10px] opacity-50">
                  {formatDate(row.started_at)} / {formatDuration(row.duration_s)} /{" "}
                  {formatSize(row.file_size)}
                </p>
              </div>
              <button
                aria-label={`Open ${row.id}`}
                className="rounded border border-neutral-200 p-1 hover:bg-neutral-50"
                onClick={() => void reveal(row.id)}
                type="button"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!showAll && rows.length >= 10 && (
        <button
          className="mt-2 text-xs font-medium opacity-50 hover:opacity-90"
          onClick={() => setShowAll(true)}
          type="button"
        >
          Show all
        </button>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(value: number | null): string {
  if (value == null) return "--";
  return `${value.toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
