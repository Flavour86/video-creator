"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/app-shell/PageChrome";
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
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">No project open. Go to Launcher and open a project.</p>
      </PageChrome>
    );
  }

  const refreshKey =
    state.status === "done"
      ? state.renderId
      : selectedRenderId;

  return (
    <PageChrome>
      <RenderPipeline
        onCancel={() => void cancel()}
        projectPath={projectPath}
        state={state}
      />
      <RenderHistory projectPath={projectPath} refreshKey={refreshKey} />
    </PageChrome>
  );
}

export default function RenderPage() {
  return (
    <Suspense>
      <RenderContent />
    </Suspense>
  );
}
