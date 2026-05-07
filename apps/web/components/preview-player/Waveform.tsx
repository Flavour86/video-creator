"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaybackTime } from "@/lib/hooks/usePlaybackTime";

type Sentence = { index: number; start_s: number; end_s: number };

type Props = {
  audioUrl: string;
  sentences?: Sentence[];
  activeSentenceIndex?: number;
  seekToTime?: number | null;
  onTimeUpdate?: (time: number) => void;
  onDurationReady?: (duration: number) => void;
  onSeekRequest?: (time: number) => void;
};

export function Waveform({
  audioUrl,
  sentences = [],
  activeSentenceIndex,
  seekToTime,
  onTimeUpdate,
  onDurationReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<{ playPause(): void; setTime(t: number): void; getDuration(): number; getCurrentTime(): number; destroy(): void } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const getTime = useCallback(
    () => wsRef.current?.getCurrentTime() ?? 0,
    [],
  );
  const currentTime = usePlaybackTime(isReady ? getTime : null);

  // Propagate RAF-driven time to parent
  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);

  // Load WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;
    let ws: typeof wsRef.current;

    async function init() {
      const { default: WaveSurfer } = await import("wavesurfer.js");
      ws = WaveSurfer.create({
        container: containerRef.current!,
        height: 80,
        waveColor: "#94a3b8",
        progressColor: "#0ea5e9",
        cursorColor: "#0369a1",
        normalize: true,
        barWidth: 2,
        barGap: 1,
        interact: true,
      });
      ws.load(audioUrl);
      ws.on("ready", () => {
        const dur = ws!.getDuration();
        setDuration(dur);
        setIsReady(true);
        wsRef.current = ws!;
        onDurationReady?.(dur);
      });
      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => setIsPlaying(false));
    }

    void init();
    return () => { ws?.destroy(); wsRef.current = null; setIsReady(false); };
  }, [audioUrl]);

  // External seek (e.g. clicking a sentence in TranscriptPanel)
  useEffect(() => {
    if (seekToTime != null && isReady && wsRef.current) {
      wsRef.current.setTime(seekToTime);
    }
  }, [seekToTime, isReady]);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Waveform canvas + sentence boundary overlays */}
      <div className="relative overflow-hidden rounded bg-neutral-50">
        <div ref={containerRef} />
        {isReady && duration > 0 && sentences.map((s) => (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-sky-400/25"
            key={s.index}
            style={{ left: `${(s.start_s / duration) * 100}%` }}
          />
        ))}
        {isReady && duration > 0 && activeSentenceIndex != null &&
          sentences.filter((s) => s.index === activeSentenceIndex).map((s) => (
            <div
              className="pointer-events-none absolute top-0 h-full bg-sky-400/10"
              key={`active-${s.index}`}
              style={{
                left: `${(s.start_s / duration) * 100}%`,
                width: `${((s.end_s - s.start_s) / duration) * 100}%`,
              }}
            />
          ))}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3">
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs text-white transition-opacity disabled:opacity-40"
          disabled={!isReady}
          onClick={() => wsRef.current?.playPause()}
          type="button"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <span className="font-mono text-xs tabular-nums opacity-60">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  );
}
