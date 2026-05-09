"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RuntimeHealthResponse, RuntimeState } from "@vc/shared-schemas";
import { StatusTag } from "@/components/ui";
import { useRuntimeStatus } from "@/lib/hooks/useRuntimeStatus";
import { MetricGrid } from "./MetricGrid";

type RuntimeRowData = {
  label: string;
  state: RuntimeState;
  value: string;
};

type RuntimeLabels = Record<"node" | "python" | "ffmpeg" | "cuda" | "whisperx", string>;

export function RuntimeCard() {
  const t = useTranslations("pages.launcher.runtime");
  const metrics = useTranslations("pages.launcher.metrics");
  const { error, isLoading, status } = useRuntimeStatus();
  const unavailable = t("unavailable");
  const unknown = t("unknown");
  const runtime = status && !error ? status : null;
  const labels: RuntimeLabels = {
    node: t("node"),
    python: t("python"),
    ffmpeg: t("ffmpeg"),
    cuda: t("cuda"),
    whisperx: t("whisperx"),
  };
  const rows: RuntimeRowData[] = runtime
    ? runtimeRows(runtime, labels, unavailable, unknown)
    : unavailableRows(labels, unavailable);
  const headerLabel = isLoading ? t("checking") : runtime ? t("ready") : unavailable;

  return (
    <section className="rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-7)">
      <div className="mb-(--space-4) flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StatusTag variant={runtime ? "ready" : "warning"}>{headerLabel}</StatusTag>
      </div>
      <div>
        {rows.map((row, index) => (
          <RuntimeRow index={index} key={row.label} label={row.label} state={row.state} value={row.value} />
        ))}
      </div>
      <MetricGrid
        activeRenders={status?.active_renders ?? 0}
        cachedProjects={status?.cached_projects ?? 0}
        labels={{ activeRenders: metrics("activeRenders"), cachedProjects: metrics("cachedProjects") }}
      />
    </section>
  );
}

function runtimeRows(
  runtime: RuntimeHealthResponse,
  labels: RuntimeLabels,
  unavailable: string,
  unknown: string,
): RuntimeRowData[] {
  return [
    {
      label: labels.node,
      state: runtime.node.status,
      value: versionValue(runtime.node.status, runtime.node.version, unavailable, unknown),
    },
    {
      label: labels.python,
      state: runtime.python.status,
      value: versionValue(runtime.python.status, runtime.python.version, unavailable, unknown),
    },
    {
      label: labels.ffmpeg,
      state: runtime.ffmpeg.status,
      value: versionValue(runtime.ffmpeg.status, runtime.ffmpeg.version, unavailable, unknown),
    },
    { label: labels.cuda, state: runtime.cuda.status, value: cudaValue(runtime, unavailable, unknown) },
    {
      label: labels.whisperx,
      state: runtime.whisperx.status,
      value: runtime.whisperx.status === "ready" ? runtime.whisperx.model : unavailable,
    },
  ];
}

function unavailableRows(labels: RuntimeLabels, unavailable: string): RuntimeRowData[] {
  return Object.values(labels).map((label) => ({
    label,
    state: "unavailable",
    value: unavailable,
  }));
}

function RuntimeRow({ index, label, state, value }: RuntimeRowData & { index: number }) {
  const stateClass = state === "ready" ? "text-(--green)" : "text-(--amber)";

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

function versionValue(state: RuntimeState, version: string, unavailable: string, unknown: string): string {
  if (state === "ready" && version !== "unknown") {
    return version;
  }
  return state === "unknown" ? unknown : unavailable;
}

function cudaValue(runtime: RuntimeHealthResponse, unavailable: string, unknown: string): string {
  if (runtime.cuda.status !== "ready") {
    return versionValue(runtime.cuda.status, runtime.cuda.version, unavailable, unknown);
  }
  const values = [runtime.cuda.version, runtime.cuda.gpu_label].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(" · ") : unknown;
}
