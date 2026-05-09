import { Loader2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DetectedTranscript, DetectedVoice, SetupAlignment, SetupAlignmentState } from "@vc/shared-schemas";
import { Button, StatusTag, type StatusTagVariant } from "@/components/ui";
import { formatDuration, truncateHash } from "@/lib/format";

type AlignmentCardProps = {
  alignment: SetupAlignment;
  onRun: () => void;
  transcript: DetectedTranscript | null;
  voice: DetectedVoice | null;
};

export function AlignmentCard({ alignment, onRun, transcript, voice }: AlignmentCardProps) {
  const t = useTranslations("pages.setup.alignment");
  const checks = useTranslations("pages.setup.checks");
  const canRun = Boolean(voice && transcript && alignment.status !== "running");
  const running = alignment.status === "running";
  const ActionIcon = running ? Loader2 : Play;
  const voiceFile = fileName(voice?.path) ?? t("voiceFile");
  const transcriptFile = fileName(transcript?.path) ?? "transcript.txt";

  return (
    <aside className="rounded-(--r) border border-(--line) bg-(--bg-2) p-(--space-7)">
      <div className="mb-(--space-5) flex items-center justify-between gap-(--space-4)">
        <h3 className="vc-type-eyebrow text-(--text-2)">{t("title")}</h3>
        <StatusTag variant={alignmentVariant(alignment.status)}>{t(`state.${alignment.status}`)}</StatusTag>
      </div>
      <p className="text-xs leading-relaxed text-(--text-3)">
        {t.rich("introDynamic", {
          mono: () => <span className="font-mono text-(--text-2)">{voiceFile}</span>,
        })}
      </p>
      <div className="mt-(--space-5) flex flex-col gap-2.5 rounded-(--r-sm) border border-(--line) bg-(--bg-1) p-(--space-5)">
        <div className="flex items-center justify-between gap-(--space-4)">
          <strong className="text-sm font-semibold text-(--text)">{t("forced")}</strong>
          <StatusTag variant={running ? "info" : alignment.cache_hit ? "ready" : "warning"}>
            {running ? t("cache.running") : alignment.cache_hit ? t("cache.hit") : t("cache.miss")}
          </StatusTag>
        </div>
        <p className="break-all font-mono text-[10.5px] text-(--text-4)">
          {t("hashDynamic", { hash: truncateHash(alignment.hash, 8), transcript: transcriptFile, voice: voiceFile })}
        </p>
        <div className="grid grid-cols-2 gap-x-(--space-8)">
          <KV label={t("kv.device")} value={alignment.device} />
          <KV label={t("kv.model")} value={alignment.model} />
          <KV label={t("kv.estimated")} value="~52s" />
          <KV label={t("kv.duration")} value={voice ? formatDuration(alignment.audio_duration) : t("kv.pending")} />
        </div>
        <Button className="w-full" disabled={!canRun} onClick={onRun} variant="render">
          <ActionIcon aria-hidden="true" className={`h-(--space-4) w-(--space-4) ${running ? "animate-spin" : ""}`} />
          {running ? t("running", { eta: "52s" }) : t("run")}
        </Button>
      </div>
      <ul className="mt-(--space-6) m-0 flex list-none flex-col gap-(--space-3) p-0">
        <CheckItem tone={transcript ? "ready" : "warning"}>
          {transcript ? checks("transcriptReadable", { count: transcript.sentence_count }) : checks("transcriptMissing")}
        </CheckItem>
        <CheckItem tone={voice ? "ready" : "warning"}>
          {voice ? checks("audioValid", { codec: voice.codec, sampleRate: `${voice.sample_rate / 1000}kHz` }) : checks("audioMissing")}
        </CheckItem>
        <CheckItem tone="info">{checks("mediaLater")}</CheckItem>
        <CheckItem tone="info">
          {checks.rich("cacheTarget", { mono: (chunks) => <span className="font-mono text-(--text-2)">{chunks}</span> })}
        </CheckItem>
      </ul>
    </aside>
  );
}

function fileName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).pop();
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-(--space-4) py-(--space-1) text-[11.5px]">
      <span className="text-(--text-3)">{label}</span>
      <span className="font-mono text-(--text-2)">{value}</span>
    </div>
  );
}

function CheckItem({ children, tone }: { children: ReactNode; tone: StatusTagVariant }) {
  const color = tone === "ready" ? "bg-(--green)" : tone === "warning" ? "bg-(--amber)" : "bg-(--blue)";
  return (
    <li className="flex items-center gap-[9px] text-xs text-(--text-2)">
      <span aria-hidden="true" className={`h-(--space-2) w-(--space-2) rounded-(--r-pill) ${color}`} />
      <span>{children}</span>
    </li>
  );
}

function alignmentVariant(status: SetupAlignmentState): StatusTagVariant {
  if (status === "aligned") {
    return "ready";
  }
  if (status === "running") {
    return "info";
  }
  return status === "failed" ? "error" : "warning";
}
