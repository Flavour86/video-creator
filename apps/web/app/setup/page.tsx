"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef } from "react";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { AlignmentCard } from "@/components/setup/AlignmentCard";
import { PathCard } from "@/components/setup/PathCard";
import { StatusTile, type StatusTileState } from "@/components/setup/StatusTile";
import { Stepper } from "@/components/setup/Stepper";
import { Button, Field, Select, TextInput } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import { defaultSetupPath, useSetupDraft } from "@/lib/setup/useSetupDraft";

const outputPresets = ["final", "draft", "vertical"] as const;

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
  const inputsRef = useRef<HTMLDivElement>(null);
  const setup = useSetupDraft(searchParams.get("path") ?? defaultSetupPath);
  const { draft } = setup;

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
            disabled={!setup.canContinue}
            onClick={() => router.push(`/editor?project=${encodeURIComponent(draft.path)}`)}
            variant="primary"
          >
            {t("continueToEditor")}
          </Button>
        </div>
      </header>
      <Stepper
        draft={draft}
        onFolderClick={() => window.scrollTo({ behavior: "smooth", top: 0 })}
        onInputsClick={() => inputsRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
      <section className="rounded-(--r) border border-(--line) bg-(--bg-2) p-[18px]">
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
            <Select
              aria-label={t("fields.outputPreset")}
              className="h-[33px] rounded-(--r-sm) bg-(--bg-1) text-[12.5px]"
              onChange={(event) => setup.setOutputPreset(event.target.value)}
              value={draft.output_preset}
            >
              {outputPresets.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`presets.${preset}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-[18px]">
          <PathCard onChange={() => setup.setPath(defaultSetupPath)} path={draft.path} />
        </div>
        <div className="mt-[18px] border-t border-(--line-soft) pt-[18px]" ref={inputsRef}>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-normal text-(--text-2)">
            {t("inputs.title")}
          </h3>
          <p className="mb-(--space-5) text-xs leading-relaxed text-(--text-3)">{t("inputs.body")}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <StatusTile
              filename={fileName(draft.voice?.path)}
              kind="voice"
              meta={
                draft.voice
                  ? `${formatDuration(draft.voice.duration)} · ${draft.voice.sample_rate / 1000}kHz · ${channelLabel(draft.voice.channels)}`
                  : undefined
              }
              state={voiceTileState(draft.voice?.state)}
            />
            <StatusTile
              filename={fileName(draft.transcript?.path)}
              kind="transcript"
              meta={draft.transcript ? t("inputs.transcriptDetected", { count: draft.transcript.sentence_count }) : undefined}
              state={transcriptTileState(draft.transcript?.state)}
            />
          </div>
        </div>
      </section>
      <AlignmentCard
        alignment={draft.alignment}
        onRun={() => void setup.runAlignment()}
        transcript={draft.transcript}
        voice={draft.voice}
      />
    </PageChrome>
  );
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
