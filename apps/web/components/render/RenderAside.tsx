import type { RenderHistoryEntry, RenderJob } from "@/lib/render/types";
import { AfterRenderPanel } from "./AfterRenderPanel";
import { HistoryPanel } from "./HistoryPanel";
import { OutputPanel } from "./OutputPanel";

type RenderAsideProps = {
  activeId: string | null;
  entries: RenderHistoryEntry[];
  job: RenderJob | null;
  onDeleteHistory: (id: string) => void;
  onPlay: () => void;
  onPurgeHistory: () => void;
  projectName: string;
  revealEnabled: boolean;
  onReveal: (path?: string) => void;
  onSelectHistory: (id: string) => void;
};

export function RenderAside({
  activeId,
  entries,
  job,
  onDeleteHistory,
  onPlay,
  onPurgeHistory,
  projectName,
  revealEnabled,
  onReveal,
  onSelectHistory,
}: RenderAsideProps) {
  return (
    <aside className="col-start-1 row-start-4 flex flex-col gap-[14px] lg:col-start-2 lg:row-span-2 lg:row-start-2">
      <OutputPanel job={job} projectName={projectName} />
      <HistoryPanel
        activeId={activeId}
        entries={entries}
        onDelete={onDeleteHistory}
        onPurge={onPurgeHistory}
        revealEnabled={revealEnabled}
        onReveal={(path) => onReveal(path)}
        onSelect={onSelectHistory}
      />
      <AfterRenderPanel job={job} onPlay={onPlay} onReveal={() => onReveal()} revealEnabled={revealEnabled} />
    </aside>
  );
}
