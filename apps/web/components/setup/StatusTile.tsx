import { AudioWaveform, Check, Copy, Type, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusTag, type StatusTagVariant } from "@/components/ui";

export type StatusTileState = "pending" | "copying" | "detected" | "invalid";

type StatusTileProps = {
  filename?: string;
  kind: "voice" | "transcript";
  meta?: string;
  state: StatusTileState;
};

export function StatusTile({ filename, kind, meta, state }: StatusTileProps) {
  const t = useTranslations("pages.setup.inputs");
  const Icon = iconFor(kind, state);
  const displayName = filename ?? (kind === "voice" ? t("voiceFile") : "transcript.txt");

  return (
    <div className={`flex flex-col items-center gap-(--space-3) rounded-(--r-sm) border px-(--space-6) py-(--space-8) text-center transition-[border-color,background] duration-150 ${tileClass(state)}`}>
      <Icon aria-hidden="true" className={`h-(--space-8) w-(--space-8) ${iconClass(state)}`} />
      <strong className="text-sm font-semibold text-(--text)">{displayName}</strong>
      <span className="font-mono text-[11px] text-(--text-3)">{meta ?? t(`${kind}Pending`)}</span>
      <StatusTag variant={tagVariant(state)}>{t(stateLabel(kind, state))}</StatusTag>
    </div>
  );
}

function iconFor(kind: "voice" | "transcript", state: StatusTileState) {
  if (state === "detected") {
    return Check;
  }
  if (state === "copying") {
    return Copy;
  }
  if (state === "invalid") {
    return X;
  }
  return kind === "voice" ? AudioWaveform : Type;
}

function tileClass(state: StatusTileState): string {
  if (state === "detected") {
    return "border-(--green-line) bg-(--green-bg)";
  }
  if (state === "invalid") {
    return "border-(--red-line) bg-(--red-bg)";
  }
  if (state === "copying") {
    return "border-(--amber-line) bg-(--amber-bg)";
  }
  return "border-dashed border-(--bg-5) bg-(--bg-1) text-(--text-3)";
}

function iconClass(state: StatusTileState): string {
  if (state === "detected") {
    return "text-(--green)";
  }
  if (state === "invalid") {
    return "text-(--red)";
  }
  if (state === "copying") {
    return "text-(--amber)";
  }
  return "text-(--text-3)";
}

function tagVariant(state: StatusTileState): StatusTagVariant {
  if (state === "detected") {
    return "ready";
  }
  if (state === "invalid") {
    return "error";
  }
  return state === "copying" ? "warning" : "idle";
}

function stateLabel(kind: "voice" | "transcript", state: StatusTileState): string {
  if (state === "detected") {
    return kind === "voice" ? "copied" : "parsed";
  }
  if (state === "invalid") {
    return kind === "voice" ? "invalid" : "empty";
  }
  return state;
}
