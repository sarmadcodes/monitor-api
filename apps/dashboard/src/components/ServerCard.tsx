import type { ServerSnapshot } from "@infra-monitor/shared";
import { StatusDot } from "./StatusDot";
import { formatBytes, formatBytesPerSec, formatRelativeTime, formatUptimeSeconds } from "@/lib/format";

export function ServerCard({ server }: { server: ServerSnapshot }) {
  const m = server.metrics;
  const online = server.connectionStatus === "online";
  const onlineCount = server.processes.filter((p) => p.status === "online").length;
  const stoppedCount = server.processes.filter((p) => p.status === "stopped").length;
  const erroredCount = server.processes.filter((p) => p.status === "errored").length;

  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot color={online ? "healthy" : "critical"} pulse={online} />
            <h3 className="font-semibold text-white">{server.name}</h3>
          </div>
          <p className="mono mt-0.5 text-xs text-status-muted">{server.environment}</p>
        </div>
        <span className="mono text-xs text-status-muted">
          {online ? "HEALTHY" : `offline · ${formatRelativeTime(server.lastSeen)}`}
        </span>
      </div>

      {m ? (
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="mono text-lg font-semibold text-white">{m.cpuUsagePercent.toFixed(0)}%</div>
            <div className="text-[10px] uppercase text-status-muted">CPU</div>
          </div>
          <div>
            <div className="mono text-lg font-semibold text-white">
              {((m.memUsedBytes / m.memTotalBytes) * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] uppercase text-status-muted">RAM</div>
          </div>
          <div>
            <div className="mono text-lg font-semibold text-white">
              {m.diskPercent !== null ? `${m.diskPercent.toFixed(0)}%` : "—"}
            </div>
            <div className="text-[10px] uppercase text-status-muted">Disk</div>
          </div>
          <div>
            <div className="mono text-lg font-semibold text-white">{formatUptimeSeconds(m.uptimeSeconds)}</div>
            <div className="text-[10px] uppercase text-status-muted">Uptime</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-status-muted">Waiting for first metrics report…</p>
      )}

      {m && (
        <div className="mt-3 flex justify-between text-[11px] text-status-muted">
          <span className="mono">↓ {formatBytesPerSec(m.netRxBytesPerSec)}</span>
          <span className="mono">↑ {formatBytesPerSec(m.netTxBytesPerSec)}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-bg-border pt-3 text-xs">
        <span className="text-status-healthy">{onlineCount} online</span>
        <span className="text-status-muted">{stoppedCount} stopped</span>
        <span className={erroredCount > 0 ? "text-status-critical" : "text-status-muted"}>
          {erroredCount} critical
        </span>
      </div>
    </div>
  );
}
