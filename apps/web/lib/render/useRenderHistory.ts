import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api/server";
import { normalizeHistory, type RenderHistoryResponse } from "./normalize";
import type { RenderHistoryEntry } from "./types";

export function useRenderHistory(projectId: string, refreshKey = "") {
  const [entries, setEntries] = useState<RenderHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = projectId
        ? await request<RenderHistoryResponse[]>(`/projects/${encodeURIComponent(projectId)}/renders?limit=50` as `/${string}`)
        : [];
      setEntries(rows.map(normalizeHistory));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const remove = useCallback(async (id: string) => {
    if (!projectId) return;
    await request(`/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(id)}` as `/${string}`, { method: "DELETE" });
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, [projectId]);

  const purgeAll = useCallback(async () => {
    if (!projectId) return;
    await Promise.all(entries.map((entry) => request(`/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(entry.id)}` as `/${string}`, { method: "DELETE" })));
    setEntries([]);
  }, [entries, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return { entries, isLoading, purgeAll, refresh, remove };
}
