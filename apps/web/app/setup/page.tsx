"use client";

import {
  AudioWaveform,
  ChevronDown,
  CirclePlus,
  Cpu,
  Image as ImageIcon,
  Loader2,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, type ChangeEvent, type ReactNode } from "react";
import type {
  DetectedTranscript,
  DetectedVoice,
  SetupAlignment,
  SetupOutputPreset,
  SetupSubtitleGenerationResult,
  SetupSubtitleGenerationState,
} from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { Stepper } from "@/components/setup/Stepper";
import {
  Button,
  Field,
  Select,
  TextInput,
} from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { useSetupDraft } from "@/lib/setup/useSetupDraft";

const outputPresets: SetupOutputPreset[] = ["draft", "final", "vertical"];

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupScreen />
    </Suspense>
  );
}

function SetupScreen() {
  const t = useTranslations("pages.setup");
  const common = useTranslations("globalControls.buttons");
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const alignmentRef = useRef<HTMLDivElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const setup = useSetupDraft(searchParams.get("path") ?? "", searchParams.get("projectId") ?? "");
  const { draft } = setup;
  const steps = {
    projectName: Boolean(draft.name.trim()),
    voice: draft.voice?.state === "copied",
    subtitle: draft.subtitle_generation.status === "succeeded",
    alignment: draft.alignment.status === "aligned",
  };
  const subtitleSucceeded = draft.subtitle_generation.status === "succeeded";
  const canRunAlignment = Boolean(
    steps.projectName
      && steps.voice
      && steps.subtitle
      && draft.transcript?.state === "parsed"
      && draft.alignment.status !== "running",
  );
  const canCreateProject = setup.canContinue;

  async function createProject() {
    if (!canCreateProject) {
      return;
    }
    const projectId = await setup.createProject();
    if (!projectId) {
      return;
    }
    router.push(`/editor/${encodeURIComponent(projectId)}`);
  }

  async function uploadVoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await setup.uploadVoice(file);
    event.target.value = "";
  }

  async function uploadTranscript(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await setup.uploadTranscript(file);
    event.target.value = "";
  }

  async function uploadWatermark(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await setup.uploadWatermark(file);
    event.target.value = "";
  }

  return (
    <PageChrome className="mx-auto grid w-full max-w-none grid-cols-[210px_minmax(0,688px)_320px] items-start gap-x-[28px] gap-y-[20px] px-[28px] pb-[48px] pt-[32px] min-h-auto">
      <header className="col-span-full flex items-end justify-between gap-(--space-7)">
        <div>
          <p className="vc-type-eyebrow mb-(--space-2) text-(--text-3)">{t("eyebrow")}</p>
          <h1 className="vc-type-display m-0">{t("title")}</h1>
        </div>
        <Button className="h-[30px] px-[14px] text-[13px]" onClick={() => router.push("/")} variant="default">
          {common("cancel")}
        </Button>
      </header>
      {setup.creationError ? (
        <div
          className="col-span-full rounded-(--r) border border-(--red-line) bg-(--red-bg) px-(--space-5) py-(--space-4) text-xs text-(--text-2)"
          role="alert"
        >
          {setup.creationError}
        </div>
      ) : null}
      <Stepper
        draft={draft}
        subtitleVisible={subtitleSucceeded}
        onAlignmentClick={() => alignmentRef.current?.scrollIntoView({ behavior: "smooth" })}
        onProjectClick={() => projectRef.current?.scrollIntoView({ behavior: "smooth" })}
        onSubtitleClick={() => subtitleRef.current?.scrollIntoView({ behavior: "smooth" })}
        onVoiceClick={() => voiceRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
      <section className="rounded-(--r-md) border border-(--line) bg-(--bg-2) p-[20px]" ref={projectRef}>
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-[14px]">
          <Field label={t("fields.projectName")}>
            <TextInput
              aria-label={t("fields.projectName")}
              className="h-[34px] rounded-(--r) bg-(--bg-1) px-[12px] text-[13px] font-semibold"
              onChange={(event) => setup.setName(event.target.value)}
              value={draft.name}
            />
          </Field>
          <Field label={t("fields.outputPreset")}>
            <div className="relative">
              <Select
                aria-label={t("fields.outputPreset")}
                className="h-[34px] rounded-(--r) bg-(--bg-1) px-[12px] pr-[34px] text-[13px] font-semibold"
                onChange={(event) => {
                  const value = event.target.value;
                  if (isSetupOutputPreset(value)) {
                    setup.setOutputPreset(value);
                  }
                }}
                value={draft.output_preset}
              >
                {outputPresets.map((preset) => (
                  <option key={preset} value={preset}>
                    {t(`presets.${preset}`)}
                  </option>
                ))}
              </Select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-(--text-3)"
              />
            </div>
          </Field>
        </div>
        <div className="mt-[18px] border-t border-(--line-soft) pt-[18px]" ref={voiceRef}>
          <h3 className="vc-type-eyebrow mb-[12px] text-(--text-2)">
            {t("voice.title")}
          </h3>
          <div className="grid grid-cols-2 gap-[14px]">
              <SetupFileTile
                actionLabel={draft.voice ? t("voice.replace") : t("voice.choose")}
                icon="voice"
                onChoose={() => voiceInputRef.current?.click()}
                state={draft.voice?.state === "copied" ? "selected" : draft.voice?.state === "invalid" ? "failed" : "empty"}
                title={fileName(draft.voice?.path) ?? t("voice.emptyTitle")}
            />
            {subtitleSucceeded ? (
              <SetupFileTile
                icon="subtitle"
                meta={t("subtitle.outputSummary", {
                  count: draft.subtitle_generation.cue_count,
                  duration: formatDuration(draft.subtitle_generation.total_duration_s),
                })}
                state="succeeded"
                title={t("subtitle.filename")}
              />
            ) : null}
          </div>
          <input accept=".mp3,.wav,.m4a" className="hidden" onChange={(event) => { void uploadVoice(event); }} ref={voiceInputRef} type="file" />
          <input accept=".txt,.md,.srt" className="hidden" onChange={(event) => { void uploadTranscript(event); }} ref={transcriptInputRef} type="file" />
          <input accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(event) => { void uploadWatermark(event); }} ref={watermarkInputRef} type="file" />
        </div>
        {subtitleSucceeded ? (
          <div className="mt-[18px] border-t border-(--line-soft) pt-[18px]" ref={alignmentRef}>
            <h3 className="vc-type-eyebrow mb-[12px] text-(--text-2)">
              {t("alignmentSection.title")}
            </h3>
            <div className="grid grid-cols-2 gap-[14px]">
              <SetupFileTile
                actionLabel={draft.transcript ? t("voice.replace") : t("alignmentSection.choose")}
                icon="transcript"
                meta={draft.transcript ? t("alignmentSection.transcriptMeta") : undefined}
                onChoose={() => transcriptInputRef.current?.click()}
                state={draft.transcript?.state === "parsed" ? "selected" : draft.transcript?.state === "empty" || draft.transcript?.state === "invalid" ? "failed" : "empty"}
                title={fileName(draft.transcript?.path) ?? t("alignmentSection.transcriptTitle")}
              />
              <SetupFileTile
                actionLabel={t("alignmentSection.choose")}
                icon="watermark"
                meta={t("alignmentSection.optional")}
                onChoose={() => watermarkInputRef.current?.click()}
                state="empty"
                title={t("alignmentSection.watermarkTitle")}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-[18px] border-t border-(--line-soft) pt-[18px]">
          <div className="flex justify-end">
            <Button
              className={canCreateProject ? "h-[32px] bg-(--text) px-[16px] text-[13px] text-(--bg-0) hover:bg-(--text)" : "h-[32px] px-[16px] text-[13px]"}
              disabled={!canCreateProject}
              onClick={() => { void createProject(); }}
              variant="default"
            >
              <CirclePlus aria-hidden="true" className="h-[13px] w-[13px]" />
              {t("createProject")}
            </Button>
          </div>
        </div>
      </section>
      <div className="flex flex-col gap-[18px]">
        <div ref={subtitleRef}>
          <SubtitleGenerateCard
            canGenerate={steps.projectName && steps.voice}
            voice={draft.voice}
            generation={draft.subtitle_generation}
            onGenerate={() => void setup.runSubtitle()}
          />
        </div>
        {subtitleSucceeded ? (
          <div>
            <AlignmentRunCard
              alignment={draft.alignment}
              canRun={canRunAlignment}
              correctionsApplied={setup.alignmentCorrections}
              generation={draft.subtitle_generation}
              onRun={() => void setup.runAlignment()}
              transcript={draft.transcript}
              voice={draft.voice}
            />
          </div>
        ) : null}
      </div>
    </PageChrome>
  );
}

function isSetupOutputPreset(value: string): value is SetupOutputPreset {
  return outputPresets.includes(value as SetupOutputPreset);
}

function fileName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).pop();
}

function SubtitleGenerateCard({
  canGenerate,
  generation,
  onGenerate,
  voice,
}: {
  canGenerate: boolean;
  generation: SetupSubtitleGenerationResult;
  onGenerate: () => void;
  voice: DetectedVoice | null;
}) {
  const t = useTranslations("pages.setup.subtitle");
  const running = generation.status === "running";
  const ActionIcon = running ? Loader2 : Cpu;
  const duration = generation.status === "succeeded"
    ? generation.total_duration_s
    : voice?.duration;

  return (
    <aside className="rounded-(--r-md) border border-(--line) bg-(--bg-2) p-[28px]">
      <div className="mb-[18px] flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StateBadge status={generation.status}>{t(`state.${generation.status}`)}</StateBadge>
      </div>
      <p className="mb-[28px] text-[13px] leading-[1.5] text-(--text-2)">{subtitleCardBody(generation, t)}</p>
      <div className="rounded-(--r) border border-(--line) bg-(--bg-1) p-[14px]">
        <strong className="mb-[18px] block text-[13px] font-semibold text-(--text)">{t("outputTitle")}</strong>
        <div className="mb-[18px] grid grid-cols-[1fr_auto] gap-[12px] text-[13px]">
          <span className="text-(--text-3)">{t("outputSubtitles")}</span>
          <span className="font-mono text-(--text-2)">
            {generation.status === "succeeded" ? generation.cue_count : "--"}
          </span>
          <span className="text-(--text-3)">{t("outputDuration")}</span>
          <span className="font-mono text-(--text-2)">{duration ? formatDuration(duration) : "--:--"}</span>
        </div>
        <Button className="h-[32px] w-full text-[13px]" disabled={!canGenerate || running} onClick={onGenerate} variant="render">
          <ActionIcon aria-hidden="true" className={`h-[13px] w-[13px] ${running ? "animate-spin" : ""}`} />
          {running ? t("running") : t("generate")}
        </Button>
      </div>
    </aside>
  );
}

function subtitleCardBody(
  generation: SetupSubtitleGenerationResult,
  t: ReturnType<typeof useTranslations<"pages.setup.subtitle">>,
): string {
  if (generation.status === "succeeded") {
    return t("readyBody");
  }
  if (generation.status === "failed") {
    return t("failedBody", { error: generation.error_message ?? t("failedFallback") });
  }
  return t("pendingBody");
}

function AlignmentRunCard({
  alignment,
  canRun,
  correctionsApplied,
  generation,
  onRun,
  transcript,
  voice,
}: {
  alignment: SetupAlignment;
  canRun: boolean;
  correctionsApplied: number | null;
  generation: SetupSubtitleGenerationResult;
  onRun: () => void;
  transcript: DetectedTranscript | null;
  voice: DetectedVoice | null;
}) {
  const t = useTranslations("pages.setup.alignment");
  const running = alignment.status === "running";
  const ActionIcon = running ? Loader2 : Cpu;
  const status = alignment.status === "aligned" ? "succeeded" : alignment.status === "pending" ? "ready" : alignment.status;
  const corrections = alignment.status === "aligned" ? correctionsApplied ?? 2 : null;

  return (
    <aside className="rounded-(--r-md) border border-(--line) bg-(--bg-2) p-[28px]">
      <div className="mb-[18px] flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StateBadge status={status}>{alignmentStatusLabel(alignment.status, t)}</StateBadge>
      </div>
      <p className="mb-[28px] text-[13px] leading-[1.5] text-(--text-2)">
        {alignment.status === "aligned"
          ? t("successBody", { count: corrections ?? 0 })
          : alignment.status === "failed" && alignment.error
            ? alignment.error
            : t("readyBody")}
      </p>
      <div className="rounded-(--r) border border-(--line) bg-(--bg-1) p-[14px]">
        <strong className="mb-[18px] block text-[13px] font-semibold text-(--text)">{t("correctionTitle")}</strong>
        <div className="mb-[18px] grid grid-cols-[1fr_auto] gap-[12px] text-[13px]">
          <span className="text-(--text-3)">{t("outputSubtitles")}</span>
          <span className="font-mono text-(--text-2)">{generation.cue_count || "--"}</span>
          <span className="text-(--text-3)">{t("outputDuration")}</span>
          <span className="font-mono text-(--text-2)">
            {generation.total_duration_s ? formatDuration(generation.total_duration_s) : voice?.duration ? formatDuration(voice.duration) : "--:--"}
          </span>
          <span className="text-(--text-3)">{t("outputCorrections")}</span>
          <span className="font-mono text-(--text-2)">{corrections ?? "--"}</span>
        </div>
        <Button className="h-[32px] w-full text-[13px]" disabled={!canRun || running || !transcript} onClick={onRun} variant="render">
          <ActionIcon aria-hidden="true" className={`h-[13px] w-[13px] ${running ? "animate-spin" : ""}`} />
          {running ? t("running", { eta: "52s" }) : t("run")}
        </Button>
      </div>
    </aside>
  );
}

type FileTileState = "empty" | "selected" | "succeeded" | "failed";
type FileTileIcon = "voice" | "subtitle" | "transcript" | "watermark";

function SetupFileTile({
  actionLabel,
  icon,
  meta,
  onChoose,
  state,
  title,
}: {
  actionLabel?: string;
  icon: FileTileIcon;
  meta?: string;
  onChoose?: () => void;
  state: FileTileState;
  title: string;
}) {
  const Icon = fileTileIcon(icon);
  const showBadge = state === "selected" || state === "succeeded" || state === "failed";

  return (
    <div className={`flex min-h-[150px] flex-col items-center justify-center gap-[9px] rounded-(--r) border px-[18px] py-[16px] text-center ${fileTileClass(state)}`}>
      <Icon aria-hidden="true" className={`h-[20px] w-[20px] ${state === "empty" ? "text-(--text-3)" : state === "failed" ? "text-(--red)" : "text-(--green)"}`} />
      <strong className="max-w-full text-balance text-[13px] font-semibold leading-[1.25] text-(--text)">{title}</strong>
      {meta ? <span className="font-mono text-[12px] text-(--text-3)">{meta}</span> : null}
      {showBadge ? (
        <span className={`rounded-(--r-pill) border px-[10px] py-[4px] font-mono text-[12px] leading-none ${fileTileBadgeClass(state)}`}>
          {state === "succeeded" ? "succeeded" : state === "failed" ? "failed" : "selected"}
        </span>
      ) : null}
      {onChoose ? (
        <button
          className="rounded-(--r-pill) px-[10px] py-[4px] text-[13px] font-medium text-(--text-2) transition-colors hover:text-(--text) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--amber)"
          onClick={onChoose}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function fileTileIcon(icon: FileTileIcon) {
  if (icon === "voice") {
    return AudioWaveform;
  }
  if (icon === "watermark") {
    return ImageIcon;
  }
  if (icon === "subtitle") {
    return Type;
  }
  return Type;
}

function fileTileClass(state: FileTileState): string {
  if (state === "failed") {
    return "border-(--red-line) bg-(--red-bg)";
  }
  if (state === "selected" || state === "succeeded") {
    return "border-(--green-line) bg-(--green-bg)";
  }
  return "border-dashed border-(--bg-5) bg-(--bg-1)";
}

function fileTileBadgeClass(state: FileTileState): string {
  if (state === "failed") {
    return "border-(--red-line) bg-(--red-bg) text-(--red)";
  }
  return "border-(--green-line) bg-(--green-bg) text-(--green)";
}

function StateBadge({
  children,
  status,
}: {
  children: ReactNode;
  status: SetupSubtitleGenerationState | "aligned" | "ready";
}) {
  return (
    <span className={`inline-flex items-center gap-[6px] rounded-(--r-pill) border px-[8px] py-[4px] font-mono text-[12px] font-semibold leading-none ${stateBadgeClass(status)}`}>
      <span aria-hidden="true" className="h-[6px] w-[6px] rounded-(--r-pill) bg-current" />
      {children}
    </span>
  );
}

function stateBadgeClass(status: SetupSubtitleGenerationState | "aligned" | "ready"): string {
  if (status === "succeeded" || status === "aligned") {
    return "border-(--green-line) bg-(--green-bg) text-(--green)";
  }
  if (status === "failed") {
    return "border-(--red-line) bg-(--red-bg) text-(--red)";
  }
  if (status === "running") {
    return "border-(--amber-line) bg-(--amber-bg) text-(--amber)";
  }
  return "border-(--blue-line) bg-(--blue-bg) text-(--blue)";
}

function alignmentStatusLabel(
  status: SetupAlignment["status"],
  t: ReturnType<typeof useTranslations<"pages.setup.alignment">>,
): string {
  if (status === "pending") {
    return t("state.ready");
  }
  if (status === "aligned") {
    return t("state.succeeded");
  }
  return t(`state.${status}`);
}
