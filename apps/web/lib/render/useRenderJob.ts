import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/lib/api/server";
import { normalizeJob, phaseFromStatus, type RenderHistoryResponse } from "./normalize";
import type { RenderJob, RenderPreset, RenderProgressEvent, RenderSocketEvent } from "./types";

type RenderStartResponse = {
  output_path: string;
  render_id: string;
};

export function useRenderJob(projectId: string, jobId: string | null) {
  const [baseRow, setBaseRow] = useState<RenderHistoryResponse | null>(null);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  const loadJob = useCallback(async (id: string) => {
    if (!projectId) throw new Error("Project id is required.");
    const rows = await request<RenderHistoryResponse[]>(
      `/projects/${encodeURIComponent(projectId)}/history?limit=500` as `/${string}`,
    );
    const row = rows.find((entry) => (entry.render_id ?? entry.id) === id);
    if (!row) throw new Error(`Render ${id} not found.`);
    setBaseRow(row);
    setJob(normalizeJob(row));
    return row;
  }, [projectId]);

  useEffect(() => {
    setError("");
    socketRef.current?.close();
    if (!jobId) {
      setBaseRow(null);
      setJob(null);
      return;
    }
    void loadJob(jobId).catch((cause) => {
      setError(String(cause));
      setBaseRow(null);
      setJob(null);
    });
  }, [jobId, loadJob]);

  useEffect(() => {
    const row = baseRow;
    if (!row) return;
    const phase = phaseFromStatus(row.status);
    if (!["queued", "verifying", "prerender", "subtitles", "composing", "muxing", "loggingHistory", "cancelling"].includes(phase)) return;
    socketRef.current?.close();
    const ws = new WebSocket(renderWsUrl(row.id));
    socketRef.current = ws;
    ws.onmessage = (message) => {
      const event = parseSocketEvent(message.data);
      if (!event || event.type !== "progress") return;
      setJob(normalizeJob(row, event));
      if (event.stage === "done" || event.stage === "error" || event.stage === "failed" || event.stage === "cancelled") {
        ws.close();
        window.setTimeout(() => {
          void loadJob(row.id).catch(() => undefined);
        }, 350);
      }
    };
    ws.onerror = () => {
      setError("Render progress connection failed.");
    };
    return () => ws.close();
  }, [baseRow, loadJob]);

  const startRender = useCallback(async (preset: RenderPreset) => {
    if (!projectId) return null;
    const body = await request<RenderStartResponse>(`/projects/${encodeURIComponent(projectId)}/render` as `/${string}`, {
      method: "POST",
      body: { preset },
    });
    await loadJob(body.render_id);
    return body.render_id;
  }, [loadJob, projectId]);

  return { error, job, loadJob, startRender };
}

function parseSocketEvent(data: unknown): RenderSocketEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as RenderSocketEvent;
    if (value.type === "log" || value.type === "progress") return value;
  } catch {
    return null;
  }
  return null;
}

function renderWsUrl(renderId: string): string {
  const query = new URLSearchParams({ render_id: renderId });
  const configured = process.env.NEXT_PUBLIC_SERVER_WS_URL;
  if (configured) return `${configured.replace(/\/$/, "")}/projects/render/ws?${query.toString()}`;
  if (typeof window === "undefined") return `/projects/render/ws?${query.toString()}`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/server/projects/render/ws?${query.toString()}`;
}
