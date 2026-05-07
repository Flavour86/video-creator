"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { RenderHistory } from "@/components/render-history/RenderHistory";
import { RenderPipeline } from "@/components/render-pipeline/RenderPipeline";
import { useRenderProgress } from "@/lib/hooks/useRenderProgress";

function RenderContent() {
  const params = useSearchParams();
  const projectPath = params.get("project") ?? "";
  const selectedRenderId = params.get("renderId") ?? "";
  const { cancel, startFinal, state } = useRenderProgress(projectPath);
  const autoStartedProjectRef = useRef("");

  useEffect(() => {
    autoStartedProjectRef.current = "";
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || selectedRenderId || state.status !== "idle") return;
    if (autoStartedProjectRef.current === projectPath) return;
    autoStartedProjectRef.current = projectPath;
    void startFinal();
  }, [projectPath, selectedRenderId, state.status, startFinal]);

  if (!projectPath) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <p className="text-sm opacity-60">No project open. Go to Launcher and open a project.</p>
      </main>
    );
  }

  const refreshKey =
    state.status === "done"
      ? state.renderId
      : selectedRenderId;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <RenderPipeline
        onCancel={() => void cancel()}
        projectPath={projectPath}
        state={state}
      />
      <RenderHistory projectPath={projectPath} refreshKey={refreshKey} />
    </main>
  );
}

export default function RenderPage() {
  return (
    <Suspense>
      <RenderContent />
    </Suspense>
  );
}
