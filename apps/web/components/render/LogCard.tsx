import { CornerDownRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui";
import type { RenderJob } from "@/lib/render/types";
import { type LogLine, useFfmpegLog } from "@/lib/render/useFfmpegLog";
import { useStickyScroll } from "@/lib/render/useStickyScroll";

export function LogCard({ job }: { job: RenderJob | null }) {
  const t = useTranslations("pages.render.log");
  const bodyRef = useRef<HTMLDivElement>(null);
  const { follow, lines, paused } = useFfmpegLog(job?.id ?? null, job?.phase ?? "idle");
  const sticky = useStickyScroll(bodyRef, 8);
  const visibleLines = lines.length ? lines : persistedLines(job);

  useEffect(() => {
    sticky.scrollIfSticky();
  }, [lines.length, sticky]);

  const terminal = job?.phase === "done" || job?.phase === "failed" || job?.phase === "ffmpegFatalError" || job?.phase === "cancelled";

  return (
    <section className="col-start-1 row-start-3 flex flex-col overflow-hidden rounded-[10px] border border-(--line) bg-(--bg-2) self-start">
      <div className="flex items-center justify-between border-b border-(--line) px-[14px] py-[10px]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--text-2)">{t("head")}</h2>
        <button className="font-mono text-[10.5px] text-(--text-3)" onClick={() => { follow(); sticky.follow(); }} type="button">
          {terminal ? t(`meta${job?.phase === "cancelled" ? "Cancelled" : job?.phase === "failed" || job?.phase === "ffmpegFatalError" ? "Stopped" : "Finished"}`) : paused || sticky.paused ? t("metaPaused") : t("meta")}
        </button>
      </div>
      <div
        className={`relative bg-(--bg-0) px-[14px] py-[12px] font-mono text-[11px] leading-[1.55] text-(--text-2) ${job ? "max-h-[min(40vh,360px)] overflow-y-auto" : "h-0 overflow-hidden p-0"}`}
        onScroll={() => {
          sticky.onScroll();
          if (sticky.paused) follow();
        }}
        ref={bodyRef}
      >
        {visibleLines.map((line, index) => (
          <LogRow key={`${line.timestamp}-${index}`} line={line} />
        ))}
        {sticky.paused ? (
          <div className="sticky bottom-2 flex justify-end">
            <IconButton icon={CornerDownRight} label={t("resume")} onClick={() => { follow(); sticky.follow(); }} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LogRow({ line }: { line: LogLine }) {
  return (
    <div className="whitespace-pre">
      <span className="text-(--text-4)">[{line.timestamp}]</span>{" "}
      {line.glyph ? <span className={glyphClass(line.glyph)}>{glyph(line.glyph)} </span> : null}
      <span>{line.line}</span>
    </div>
  );
}

function persistedLines(job: RenderJob | null): LogLine[] {
  if (!job) return [];
  const eventLines = job.events
    .filter((event) => event.message)
    .slice(-2000)
    .map((event): LogLine => ({
      glyph: glyphForEvent(event.stage),
      line: event.message ?? "",
      timestamp: event.event_id ?? event.render_id ?? "persisted",
    }));
  if (eventLines.length > 0) return eventLines;
  const logArtifact = job.artifacts.find((artifact) => artifact.kind === "log");
  if (logArtifact) {
    return [{ glyph: "info", line: `persisted log: ${logArtifact.path}`, timestamp: "persisted" }];
  }
  return [{ line: "waiting for ffmpeg output", timestamp: "00:00:00" }];
}

function glyphForEvent(stage: string | undefined): LogLine["glyph"] {
  if (stage === "done") return "ok";
  if (stage === "failed" || stage === "error") return "err";
  if (stage === "cancelled") return "warn";
  return "info";
}

function glyph(kind: LogLine["glyph"]): string {
  if (kind === "ok") return "OK";
  if (kind === "warn") return "!";
  if (kind === "err") return "ERR";
  return ">";
}

function glyphClass(kind: LogLine["glyph"]): string {
  if (kind === "ok") return "text-(--green)";
  if (kind === "warn") return "text-(--amber)";
  if (kind === "err") return "text-(--red)";
  return "text-(--blue)";
}
