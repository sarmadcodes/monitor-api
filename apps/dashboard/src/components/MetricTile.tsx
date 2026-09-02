import clsx from "clsx";

function levelColor(percent: number | null): string {
  if (percent === null) return "text-status-muted";
  if (percent >= 90) return "text-status-critical";
  if (percent >= 70) return "text-status-warning";
  return "text-status-healthy";
}

export function MetricTile({
  label,
  value,
  percent,
  sub,
}: {
  label: string;
  value: string;
  percent?: number | null;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-status-muted">{label}</span>
        {sub && <span className="mono text-[11px] text-status-muted">{sub}</span>}
      </div>
      <div className={clsx("mono text-2xl font-semibold", percent !== undefined ? levelColor(percent ?? null) : "text-white")}>
        {value}
      </div>
      {percent !== undefined && percent !== null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bg-raised">
          <div
            className={clsx(
              "h-full rounded-full transition-all",
              percent >= 90 ? "bg-status-critical" : percent >= 70 ? "bg-status-warning" : "bg-status-healthy"
            )}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      )}
    </div>
  );
}
