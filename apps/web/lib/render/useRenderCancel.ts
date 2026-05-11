import { useCallback } from "react";
import { request } from "@/lib/api/server";

export function useRenderCancel(projectId = "") {
  return useCallback(async (jobId: string) => {
    if (projectId) {
      await request(`/projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(jobId)}/cancel` as `/${string}`, { method: "POST" });
      return;
    }
    await request("/render/cancel", { method: "POST", body: { jobId } });
  }, [projectId]);
}
