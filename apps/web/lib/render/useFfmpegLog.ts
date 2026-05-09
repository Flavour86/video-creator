import { useCallback, useEffect, useState } from "react";
import type { RenderSocketEvent } from "./types";

export type LogLine = {
  glyph?: "info" | "ok" | "warn" | "err";
  line: string;
  timestamp: string;
};

export function useFfmpegLog(jobId: string | null, phase: string) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setLines([]);
    if (!jobId) return;
    const ws = new WebSocket(renderWsUrl(jobId));
    ws.onmessage = (message) => {
      const event = parseSocketEvent(message.data);
      if (!event) return;
      if (event.type === "log") {
        pushLine(setLines, { glyph: "info", line: event.line, timestamp: timestamp() });
      } else if (event.type === "progress") {
        pushLine(setLines, {
          glyph: event.stage === "done" ? "ok" : event.stage === "error" ? "err" : event.stage === "cancelled" ? "warn" : undefined,
          line: event.message ?? `${event.stage} ${Math.round(event.percent)}%`,
          timestamp: timestamp(),
        });
      }
    };
    ws.onerror = () => {
      pushLine(setLines, { glyph: "err", line: "ffmpeg log connection failed", timestamp: timestamp() });
    };
    return () => ws.close();
  }, [jobId]);

  useEffect(() => {
    if (phase === "done" || phase === "error" || phase === "cancelled") {
      setPaused(true);
    }
  }, [phase]);

  const follow = useCallback(() => {
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
  }, []);

  return { follow, lines, pause, paused };
}

function pushLine(setLines: (updater: (current: LogLine[]) => LogLine[]) => void, line: LogLine) {
  setLines((current) => [...current, line].slice(-2000));
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
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
