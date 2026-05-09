type MetricGridProps = {
  cachedProjects: number;
  activeRenders: number;
  labels: {
    activeRenders: string;
    cachedProjects: string;
  };
};

export function MetricGrid({ activeRenders, cachedProjects, labels }: MetricGridProps) {
  return (
    <div className="mt-(--space-6) grid grid-cols-2 gap-px overflow-hidden rounded-(--r) border border-(--line) bg-(--line)">
      <MetricCell label={labels.activeRenders} value={activeRenders} />
      <MetricCell label={labels.cachedProjects} value={cachedProjects} />
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-(--bg-2) px-(--space-6) py-(--space-5)">
      <strong className="block font-mono text-[22px] font-semibold leading-none tracking-normal text-(--text)">
        {value}
      </strong>
      <span className="text-[10.5px] font-medium uppercase tracking-normal text-(--text-3)">{label}</span>
    </div>
  );
}
