import { useCallback, useRef } from "react";
import { request } from "@/lib/api/server";

export function useRenderCancel(projectId = "") {
  const pendingIds = useRef(new Set<string>());

  return useCallback(async (jobId: string) => {
    if (!projectId) throw new Error("Project id is required.");
    if (pendingIds.current.has(jobId)) return false;
    pendingIds.current.add(jobId);
    try {
      await request(`/projects/${encodeURIComponent(projectId)}/render/${encodeURIComponent(jobId)}` as `/${string}`, { method: "DELETE" });
      return true;
    } finally {
      pendingIds.current.delete(jobId);
    }
  }, [projectId]);
}
