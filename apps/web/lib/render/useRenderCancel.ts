import { useCallback } from "react";
import { request } from "@/lib/api/server";

export function useRenderCancel() {
  return useCallback(async (jobId: string) => {
    await request("/render/cancel", { method: "POST", body: { jobId } });
  }, []);
}
