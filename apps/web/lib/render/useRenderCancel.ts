import { useCallback } from "react";
import { request } from "@/lib/api/server";

export function useRenderCancel(projectId = "") {
  return useCallback(async (jobId: string) => {
    if (!projectId) throw new Error("Project id is required.");
    await request(`/projects/${encodeURIComponent(projectId)}/render/${encodeURIComponent(jobId)}` as `/${string}`, { method: "DELETE" });
  }, [projectId]);
}
