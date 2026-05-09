import { useCallback } from "react";
import { request } from "@/lib/api/server";

export function useSystemReveal() {
  return useCallback(async (path: string) => {
    await request("/system/reveal", { method: "POST", body: { path } });
  }, []);
}

export function useSystemOpen() {
  return useCallback(async (path: string) => {
    await request("/system/open", { method: "POST", body: { path } });
  }, []);
}
