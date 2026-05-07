"use client";

type Props = {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function tickInterval(duration: number): number {
  if (duration <= 30) return 5;
  if (duration <= 120) return 10;
  if (duration <= 300) return 30;
  if (duration <= 600) return 60;
  return 120;
}

export function TimelineRuler({ duration, currentTime, onSeek }: Props) {
  if (duration <= 0) return <div className="h-6 bg-neutral-50" />;

  const interval = tickInterval(duration);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek((x / rect.width) * duration);
  }

  return (
    <div
      className="relative h-6 cursor-pointer select-none overflow-hidden bg-neutral-50"
      onClick={handleClick}
    >
      {ticks.map((t) => (
        <div
          className="absolute top-0 flex h-full flex-col items-start"
          key={t}
          style={{ left: `${(t / duration) * 100}%` }}
        >
          <div className="h-2 w-px bg-neutral-300" />
          <span className="ml-1 text-[10px] tabular-nums leading-none opacity-40">
            {fmtTime(t)}
          </span>
        </div>
      ))}
      {/* Playhead */}
      <div
        className="pointer-events-none absolute top-0 h-full w-0.5 bg-amber-400"
        style={{ left: `${(currentTime / duration) * 100}%` }}
      />
    </div>
  );
}
