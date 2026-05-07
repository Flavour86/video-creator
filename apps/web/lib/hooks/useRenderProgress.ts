import { useCallback, useEffect, useRef, useState } from "react";

export type RenderStage = "cache_warm" | "compose" | "muxing" | "done" | "error";
export type RenderPreset = "draft" | "final";

export type RenderProgressEvent = {
  type: "progress";
  render_id: string;
  stage: RenderStage;
  percent: number;
  eta_seconds?: number;
  current_frame?: number;
  speed?: string;
  message?: string;
  output_path?: string;
};

export type RenderProgressState =
  | { status: "idle" }
  | { status: "starting" }
  | {
      status: "running";
      renderId: string;
      outputPath: string;
      stage: Exclude<RenderStage, "done" | "error">;
      percent: number;
      etaSeconds?: number;
      currentFrame?: number;
      speed?: string;
      message?: string;
    }
  | { status: "done"; renderId: string; outputPath: string; percent: number; message?: string }
  | { status: "error"; renderId?: string; outputPath?: string; percent: number; message: string };

type RenderStartResponse = {
  render_id: string;
  output_path: string;
};

export function useRenderProgress(projectPath: string) {
  const [state, setState] = useState<RenderProgressState>({ status: "idle" });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const connect = useCallback((renderId: string, outputPath: string) => {
    socketRef.current?.close();
    const ws = new WebSocket(renderWsUrl(renderId));
    socketRef.current = ws;

    ws.onmessage = (message) => {
      const event = parseProgressEvent(message.data);
      if (!event) return;
      if (event.stage === "done") {
        setState({
          status: "done",
          renderId,
          outputPath: event.output_path ?? outputPath,
          percent: 100,
          message: event.message,
        });
        ws.close();
        return;
      }
      if (event.stage === "error") {
        setState({
          status: "error",
          renderId,
          outputPath,
          percent: event.percent,
          message: event.message ?? "Render failed.",
        });
        ws.close();
        return;
      }
      setState({
        status: "running",
        renderId,
        outputPath,
        stage: event.stage,
        percent: event.percent,
        etaSeconds: event.eta_seconds,
        currentFrame: event.current_frame,
        speed: event.speed,
        message: event.message,
      });
    };

    ws.onerror = () => {
      setState({
        status: "error",
        renderId,
        outputPath,
        percent: 0,
        message: "Render progress connection failed.",
      });
    };
  }, []);

  const startRender = useCallback(async (preset: RenderPreset) => {
    if (!projectPath || state.status === "starting" || state.status === "running") return;
    setState({ status: "starting" });
    try {
      const response = await fetch(
        `/api/server/projects/render?project=${encodeURIComponent(projectPath)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preset }),
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        setState({
          status: "error",
          percent: 0,
          message: body.error?.message ?? "Render failed to start.",
        });
        return;
      }
      const body = (await response.json()) as RenderStartResponse;
      setState({
        status: "running",
        renderId: body.render_id,
        outputPath: body.output_path,
        stage: "cache_warm",
        percent: 0,
        message: "verifying cache",
      });
      connect(body.render_id, body.output_path);
    } catch (error) {
      setState({ status: "error", percent: 0, message: String(error) });
    }
  }, [connect, projectPath, state.status]);

  const startDraft = useCallback(async () => {
    await startRender("draft");
  }, [startRender]);

  const startFinal = useCallback(async () => {
    await startRender("final");
  }, [startRender]);

  const cancel = useCallback(async () => {
    if (state.status !== "running") return;
    socketRef.current?.close();
    await fetch(
      `/api/server/projects/render/${encodeURIComponent(state.renderId)}?project=${encodeURIComponent(projectPath)}`,
      { method: "DELETE" },
    );
    setState({ status: "idle" });
  }, [projectPath, state]);

  const isActive = state.status === "starting" || state.status === "running";
  const percent =
    state.status === "running" || state.status === "done" || state.status === "error"
      ? state.percent
      : 0;

  return { state, startRender, startDraft, startFinal, cancel, isActive, percent };
}

function renderWsUrl(renderId: string): string {
  const query = new URLSearchParams({ render_id: renderId });
  const configured = process.env.NEXT_PUBLIC_SERVER_WS_URL;
  if (configured) {
    return `${configured.replace(/\/$/, "")}/projects/render/ws?${query.toString()}`;
  }
  if (typeof window === "undefined") {
    return `/projects/render/ws?${query.toString()}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/server/projects/render/ws?${query.toString()}`;
}

function parseProgressEvent(data: unknown): RenderProgressEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as Partial<RenderProgressEvent>;
    if (value.type !== "progress" || !value.render_id || !value.stage) return null;
    return value as RenderProgressEvent;
  } catch {
    return null;
  }
}
