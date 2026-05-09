"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RuntimeHealthResponse, RuntimeState } from "@vc/shared-schemas";
import { StatusTag } from "@/components/ui";
import { useRuntimeStatus } from "@/lib/hooks/useRuntimeStatus";
import { MetricGrid } from "./MetricGrid";

const sampleRuntime: RuntimeHealthResponse = {
  status: "ok",
  version: "0.1.0",
  active_renders: 0,
  cached_projects: 4,
  sidecar: { status: "ready", address: "http://127.0.0.1:8787", version: "0.1.0" },
  python: { status: "ready", version: "3.11.7" },
  ffmpeg: { status: "ready", version: "6.1.1 · libx264" },
  cuda: { status: "ready", available: true, version: "12.8", gpu_label: "sm_120" },
  whisperx: { status: "ready", model: "large-v3" },
};

export function RuntimeCard() {
  const t = useTranslations("pages.launcher.runtime");
  const metrics = useTranslations("pages.launcher.metrics");
  const { status } = useRuntimeStatus();
  const runtime = status?.python && status.ffmpeg && status.cuda && status.whisperx ? status : sampleRuntime;

  const rows = [
    { label: t("node"), state: "ready" as RuntimeState, value: "22.4.1" },
    { label: t("python"), state: runtime.python.status, value: runtime.python.version },
    { label: t("ffmpeg"), state: runtime.ffmpeg.status, value: runtime.ffmpeg.version },
    { label: t("cuda"), state: runtime.cuda.status, value: cudaValue(runtime) },
    { label: t("whisperx"), state: runtime.whisperx.status, value: runtime.whisperx.model },
  ];

  return (
    <section className="rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-7)">
      <div className="mb-(--space-4) flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StatusTag variant="ready">{t("ready")}</StatusTag>
      </div>
      <div>
        {rows.map((row, index) => (
          <RuntimeRow index={index} key={row.label} label={row.label} state={row.state} value={row.value} />
        ))}
      </div>
      <MetricGrid
        activeRenders={runtime.active_renders}
        cachedProjects={runtime.cached_projects}
        labels={{ activeRenders: metrics("activeRenders"), cachedProjects: metrics("cachedProjects") }}
      />
    </section>
  );
}

function RuntimeRow({ index, label, state, value }: { index: number; label: string; state: RuntimeState; value: string }) {
  const stateClass =
    state === "ready" ? "text-(--green)" : state === "unknown" ? "text-(--amber)" : "text-(--red)";

  return (
    <div
      className={`grid grid-cols-[16px_1fr_auto] items-center gap-[9px] py-[7px] text-xs ${
        index === 0 ? "" : "border-t border-(--line-soft)"
      }`}
    >
      <Check aria-hidden="true" className={`h-(--space-4) w-(--space-4) ${stateClass}`} />
      <span className="text-(--text-2)">{label}</span>
      <span className="font-mono text-[11px] text-(--text-3)">{value}</span>
    </div>
  );
}

function cudaValue(runtime: RuntimeHealthResponse): string {
  const values = [runtime.cuda.version, runtime.cuda.gpu_label].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(" · ") : "unknown";
}
