"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { LogCard } from "@/components/render/LogCard";
import { RenderAside } from "@/components/render/RenderAside";
import { RenderCard } from "@/components/render/RenderCard";
import { RenderHead } from "@/components/render/RenderHead";
import { Button, ConfirmDialog } from "@/components/ui";
import { useRenderCancel } from "@/lib/render/useRenderCancel";
import { useRenderHistory } from "@/lib/render/useRenderHistory";
import { useRenderHotkeys } from "@/lib/render/useRenderHotkeys";
import { useRenderJob } from "@/lib/render/useRenderJob";
import { useSystemOpen, useSystemReveal } from "@/lib/render/useSystemActions";

function RenderContent() {
  const t = useTranslations("pages.render");
  const router = useRouter();
  const params = useSearchParams();
  const requestedProjectId = params.get("projectId") ?? "";
  const projectId = isValidProjectId(requestedProjectId) ? requestedProjectId : "";
  const selectedJobId = params.get("job") ?? params.get("renderId");
  const autoStartedProjectRef = useRef("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { entries, purgeAll, refresh, remove } = useRenderHistory(projectId, selectedJobId ?? "");
  const { error, job, startRender } = useRenderJob(projectId, selectedJobId);
  const cancelRender = useRenderCancel(projectId);
  const reveal = useSystemReveal();
  const open = useSystemOpen();
  const revealEnabled = job?.capabilities?.reveal_in_explorer_supported ?? false;

  const goEditor = useCallback(() => {
    const target = projectId ? `/editor?projectId=${encodeURIComponent(projectId)}` : "/editor";
    if (document.referrer.includes("/editor")) {
      router.back();
    } else {
      router.push(target as Parameters<typeof router.push>[0]);
    }
  }, [projectId, router]);

  const revealOutput = useCallback((path?: string) => {
    if (!revealEnabled) return;
    const target = path ?? job?.outputPath;
    if (target && job?.outputExists) void reveal(target);
  }, [job?.outputExists, job?.outputPath, reveal, revealEnabled]);

  const playOutput = useCallback(() => {
    if (job?.outputPath && job.outputExists) void open(job.outputPath);
  }, [job?.outputExists, job?.outputPath, open]);

  const startFinal = useCallback(async () => {
    const id = await startRender("final");
    if (id) {
      router.replace(`/render?projectId=${encodeURIComponent(projectId)}&job=${encodeURIComponent(id)}` as Parameters<typeof router.replace>[0]);
      await refresh();
    }
  }, [projectId, refresh, router, startRender]);

  useEffect(() => {
    if (!projectId || selectedJobId || job || autoStartedProjectRef.current === projectId) return;
    autoStartedProjectRef.current = projectId;
    void startFinal();
  }, [job, projectId, selectedJobId, startFinal]);

  useEffect(() => {
    if (job?.phase === "done" || job?.phase === "failed" || job?.phase === "ffmpegFatalError" || job?.phase === "cancelled") {
      void refresh();
    }
  }, [job?.phase, refresh]);

  useRenderHotkeys({
    job,
    onBack: goEditor,
    onCancel: () => setConfirmCancel(true),
    onPlay: playOutput,
    onReveal: () => revealOutput(),
  });

  if (!projectId) {
    return (
      <PageChrome variant="empty">
        <p className="vc-type-body text-(--text-2)">{t("noProject")}</p>
        <Button onClick={() => router.push("/" as Parameters<typeof router.push>[0])} variant="primary">{t("goLauncher")}</Button>
      </PageChrome>
    );
  }

  return (
    <PageChrome className="grid h-[calc(100vh-44px-40px)] grid-cols-1 grid-rows-[auto_auto_auto_auto] gap-[18px] overflow-y-auto p-[28px] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr_auto]" variant="workbench">
      <RenderHead
        job={job}
        onBack={goEditor}
        onCancel={() => setConfirmCancel(true)}
        onRetry={() => void startFinal()}
        onReveal={() => revealOutput()}
        revealEnabled={revealEnabled}
      />
      <RenderCard job={job} />
      <LogCard job={job} />
      <RenderAside
        activeId={selectedJobId}
        entries={entries}
        job={job}
        onDeleteHistory={(id) => {
          void remove(id).then(refresh);
        }}
        onPlay={playOutput}
        onPurgeHistory={() => {
          void purgeAll().then(refresh);
        }}
        revealEnabled={revealEnabled}
        onReveal={revealOutput}
        onSelectHistory={(id) => router.replace(`/render?projectId=${encodeURIComponent(projectId)}&job=${encodeURIComponent(id)}` as Parameters<typeof router.replace>[0])}
      />
      {error ? <p className="col-start-1 rounded border border-(--red-line) bg-(--red-bg) px-3 py-2 text-sm text-(--text)">{error}</p> : null}
      <ConfirmDialog
        body={t("cancelConfirm.body")}
        cancelLabel={t("cancelConfirm.keep")}
        confirmLabel={t("cancelConfirm.confirm")}
        destructive
        onConfirm={() => {
          if (job) void cancelRender(job.id).then(refresh);
        }}
        onOpenChange={setConfirmCancel}
        open={confirmCancel}
        title={t("cancelConfirm.title")}
      />
    </PageChrome>
  );
}

function isValidProjectId(value: string): boolean {
  return /^p_[A-Za-z0-9_-]+$/.test(value);
}

export default function RenderPage() {
  return (
    <Suspense>
      <RenderContent />
    </Suspense>
  );
}
