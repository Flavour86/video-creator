"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { isValidRenderId, isValidRenderProjectId, renderRoute } from "@/lib/render/routes";
import { useSystemOpen, useSystemReveal } from "@/lib/render/useSystemActions";

type RenderPageClientProps = {
  projectId: string;
  renderId: string;
};

export function RenderPageClient({ projectId, renderId }: RenderPageClientProps) {
  const t = useTranslations("pages.render");
  const router = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const validRoute = isValidRenderProjectId(projectId) && isValidRenderId(renderId);
  const activeProjectId = validRoute ? projectId : "";
  const activeRenderId = validRoute ? renderId : null;
  const { entries, purgeAll, refresh, remove } = useRenderHistory(activeProjectId, activeRenderId ?? "");
  const { error, job, startRender } = useRenderJob(activeProjectId, activeRenderId);
  const cancelRender = useRenderCancel(activeProjectId);
  const reveal = useSystemReveal();
  const open = useSystemOpen();
  const revealEnabled = job?.capabilities?.reveal_in_explorer_supported ?? false;

  const goEditor = useCallback(() => {
    const target = activeProjectId ? `/editor?projectId=${encodeURIComponent(activeProjectId)}` : "/editor";
    if (document.referrer.includes("/editor")) {
      router.back();
    } else {
      router.push(target as Parameters<typeof router.push>[0]);
    }
  }, [activeProjectId, router]);

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
      router.replace(renderRoute(activeProjectId, id) as Parameters<typeof router.replace>[0]);
      await refresh();
    }
  }, [activeProjectId, refresh, router, startRender]);

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

  if (!validRoute) {
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
        activeId={activeRenderId}
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
        onSelectHistory={(id) => router.replace(renderRoute(activeProjectId, id) as Parameters<typeof router.replace>[0])}
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
