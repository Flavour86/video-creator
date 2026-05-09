import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api/server";
import { normalizeHistory, type RenderHistoryResponse } from "./normalize";
import type { RenderHistoryEntry } from "./types";

export function useRenderHistory(refreshKey = "") {
  const [entries, setEntries] = useState<RenderHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await request<RenderHistoryResponse[]>("/render/history?include=all&limit=50");
      setEntries(rows.map(normalizeHistory));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    await request(`/render/history/${encodeURIComponent(id)}`, { method: "DELETE" });
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const purgeAll = useCallback(async () => {
    await request("/render/history", { method: "DELETE" });
    setEntries([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return { entries, isLoading, purgeAll, refresh, remove };
}
