"use client";

import { FileText, Image as ImageIcon, Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, type ChangeEvent } from "react";
import type { SetupOutputPreset, SetupSubtitleGenerationResult } from "@vc/shared-schemas";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { AlignmentCard } from "@/components/setup/AlignmentCard";
import { StatusTile, type StatusTileState } from "@/components/setup/StatusTile";
import { Stepper } from "@/components/setup/Stepper";
import {
  Button,
  Field,
  SegmentedControl,
  StatusTag,
  type StatusTagVariant,
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
  const canRunAlignment = steps.projectName && steps.voice && steps.subtitle && draft.alignment.status !== "running";
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
    <PageChrome className="mx-auto grid max-w-[1500px] grid-cols-[220px_minmax(0,1fr)_320px] gap-[18px] p-(--space-9)">
      <header className="col-span-full mb-1.5 flex items-end justify-between gap-(--space-7)">
        <div>
          <p className="vc-type-eyebrow mb-(--space-2) text-(--text-3)">{t("eyebrow")}</p>
          <h1 className="m-0 text-2xl font-bold tracking-normal text-(--text)">{t("title")}</h1>
        </div>
        <div className="flex gap-(--space-3)">
          <Button onClick={() => router.push("/")} variant="ghost">
            {common("cancel")}
          </Button>
          <Button
            disabled={!canCreateProject}
            onClick={() => { void createProject(); }}
            variant="primary"
          >
            {t("createProject")}
          </Button>
        </div>
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
        onAlignmentClick={() => alignmentRef.current?.scrollIntoView({ behavior: "smooth" })}
        onProjectClick={() => projectRef.current?.scrollIntoView({ behavior: "smooth" })}
        onSubtitleClick={() => subtitleRef.current?.scrollIntoView({ behavior: "smooth" })}
        onVoiceClick={() => voiceRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
      <section className="rounded-(--r) border border-(--line) bg-(--bg-2) p-[18px]" ref={projectRef}>
        <div className="grid grid-cols-[1fr_200px] gap-(--space-6)">
          <Field label={t("fields.projectName")}>
            <TextInput
              aria-label={t("fields.projectName")}
              className="h-[33px] rounded-(--r-sm) bg-(--bg-1) text-[12.5px]"
              onChange={(event) => setup.setName(event.target.value)}
              value={draft.name}
            />
          </Field>
          <Field label={t("fields.outputPreset")}>
            <SegmentedControl
              ariaLabel={t("fields.outputPreset")}
              className="w-full"
              items={outputPresets.map((preset) => ({
                label: t(`presetShort.${preset}`),
                value: preset,
              }))}
              onValueChange={(value) => {
                if (isSetupOutputPreset(value)) {
                  setup.setOutputPreset(value);
                }
              }}
              tone="accent"
              value={draft.output_preset}
            />
          </Field>
        </div>
        <div className="mt-[18px] border-t border-(--line-soft) pt-[18px]" ref={voiceRef}>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-normal text-(--text-2)">
            {t("inputs.title")}
          </h3>
          <p className="mb-(--space-5) text-xs leading-relaxed text-(--text-3)">{t("inputs.body")}</p>
          <div className="grid grid-cols-3 gap-2.5">
            <StatusTile
              actionLabel="Choose"
              filename={fileName(draft.voice?.path)}
              kind="voice"
              meta={
                draft.voice
                  ? `${formatDuration(draft.voice.duration)} / ${draft.voice.sample_rate / 1000}kHz / ${channelLabel(draft.voice.channels)}`
                  : undefined
              }
              onChoose={() => voiceInputRef.current?.click()}
              state={voiceTileState(draft.voice?.state)}
            />
            <StatusTile
              actionLabel="Choose"
              filename={fileName(draft.transcript?.path)}
              kind="transcript"
              meta={
                draft.transcript
                  ? t("inputs.transcriptDetected", { count: draft.transcript.sentence_count })
                  : undefined
              }
              onChoose={() => transcriptInputRef.current?.click()}
              state={transcriptTileState(draft.transcript?.state)}
            />
            <div className="flex flex-col items-center gap-(--space-3) rounded-(--r-sm) border border-dashed border-(--bg-5) bg-(--bg-1) px-(--space-6) py-(--space-8) text-center text-(--text-3)">
              <ImageIcon aria-hidden="true" className="h-(--space-8) w-(--space-8)" />
              <strong className="text-sm font-semibold text-(--text)">watermark.png</strong>
              <span className="font-mono text-[11px] text-(--text-3)">optional</span>
              <Button onClick={() => watermarkInputRef.current?.click()} size="extra-small" variant="ghost">
                Choose
              </Button>
            </div>
          </div>
          <input accept=".mp3,.wav,.m4a" className="hidden" onChange={(event) => { void uploadVoice(event); }} ref={voiceInputRef} type="file" />
          <input accept=".txt,.md,.srt" className="hidden" onChange={(event) => { void uploadTranscript(event); }} ref={transcriptInputRef} type="file" />
          <input accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(event) => { void uploadWatermark(event); }} ref={watermarkInputRef} type="file" />
        </div>
      </section>
      <div className="flex flex-col gap-[18px]">
        <div ref={subtitleRef}>
          <SubtitleGenerateCard
            canGenerate={steps.projectName && steps.voice}
            generation={draft.subtitle_generation}
            onGenerate={() => void setup.runSubtitle()}
          />
        </div>
        <div ref={alignmentRef}>
          <AlignmentCard
            alignment={draft.alignment}
            canRun={canRunAlignment}
            correctionsApplied={setup.alignmentCorrections}
            onRun={() => void setup.runAlignment()}
            transcript={draft.transcript}
            voice={draft.voice}
          />
        </div>
      </div>
    </PageChrome>
  );
}

function isSetupOutputPreset(value: string): value is SetupOutputPreset {
  return outputPresets.includes(value as SetupOutputPreset);
}

function voiceTileState(state: string | undefined): StatusTileState {
  if (state === "copied") {
    return "detected";
  }
  if (state === "copying") {
    return "copying";
  }
  return state === "invalid" ? "invalid" : "pending";
}

function transcriptTileState(state: string | undefined): StatusTileState {
  if (state === "parsed") {
    return "detected";
  }
  return state === "empty" || state === "invalid" ? "invalid" : "pending";
}

function channelLabel(channels: number): string {
  if (channels === 1) {
    return "mono";
  }
  return channels === 2 ? "stereo" : `${channels}ch`;
}

function fileName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).pop();
}

function SubtitleGenerateCard({
  canGenerate,
  generation,
  onGenerate,
}: {
  canGenerate: boolean;
  generation: SetupSubtitleGenerationResult;
  onGenerate: () => void;
}) {
  const t = useTranslations("pages.setup.subtitle");
  const running = generation.status === "running";
  const ActionIcon = running ? Loader2 : Play;

  return (
    <aside className="rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-7)">
      <div className="mb-(--space-5) flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StatusTag variant={subtitleVariant(generation.status)}>{t(`state.${generation.status}`)}</StatusTag>
      </div>
      <div className="rounded-(--r-sm) border border-(--line) bg-(--bg-1) p-(--space-5)">
        <div className="mb-(--space-4) flex items-center gap-(--space-3)">
          <FileText aria-hidden="true" className="h-(--space-6) w-(--space-6) text-(--blue)" />
          <div>
            <strong className="block text-sm font-semibold text-(--text)">{t("filename")}</strong>
            <span className="text-[11px] text-(--text-3)">
              {generation.status === "succeeded"
                ? t("summary", {
                    count: generation.cue_count,
                    duration: formatDuration(generation.total_duration_s),
                  })
                : generation.status === "failed" && generation.error_message
                  ? generation.error_message
                : t("pending")}
            </span>
          </div>
        </div>
        <Button className="w-full" disabled={!canGenerate || running} onClick={onGenerate} variant="render">
          <ActionIcon aria-hidden="true" className={`h-(--space-4) w-(--space-4) ${running ? "animate-spin" : ""}`} />
          {running ? t("running") : t("generate")}
        </Button>
      </div>
    </aside>
  );
}

function subtitleVariant(status: SetupSubtitleGenerationResult["status"]): StatusTagVariant {
  if (status === "succeeded") {
    return "ready";
  }
  if (status === "running") {
    return "info";
  }
  return status === "failed" ? "error" : "warning";
}
