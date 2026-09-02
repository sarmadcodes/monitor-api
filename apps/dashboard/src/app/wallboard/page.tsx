"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { useRequireAuth } from "@/lib/useAuth";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useDashboardStore } from "@/lib/store";
import { StatusDot } from "@/components/StatusDot";
import { combineHealth } from "@/lib/health";
import { formatBytes, formatDuration, formatUptimeSeconds } from "@/lib/format";

export default function WallboardPage() {
  const status = useRequireAuth();
  useLiveConnection(status === "authed");
  const servers = useDashboardStore((s) => Object.values(s.servers));
  const logsByServer = useDashboardStore((s) => s.logsByServer);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (status === "loading") return null;

  const allOffline = servers.filter((s) => s.connectionStatus === "offline");
  const allProcesses = servers.flatMap((s) =>
    s.processes.map((p) => ({ server: s, proc: p, health: combineHealth(p, s.health[p.name], s.connectionStatus) }))
  );
  const critical = allProcesses.filter((p) => p.health.color === "critical");

  const recentEvents = Object.entries(logsByServer)
    .flatMap(([serverId, logs]) =>
      logs
        .filter((l) => l.level === "error" || l.level === "warn")
        .map((l) => ({ serverId, log: l }))
    )
    .sort((a, b) => b.log.timestamp - a.log.timestamp)
    .slice(0, 8);

  const avg = <T,>(items: T[], f: (t: T) => number) => (items.length ? items.reduce((a, b) => a + f(b), 0) / items.length : 0);
  const cpu = avg(
    servers.filter((s) => s.metrics),
    (s) => s.metrics!.cpuUsagePercent
  );
  const ram = avg(
    servers.filter((s) => s.metrics),
    (s) => (s.metrics!.memUsedBytes / s.metrics!.memTotalBytes) * 100
  );
  const disk = avg(
    servers.filter((s) => s.metrics?.diskPercent !== null && s.metrics?.diskPercent !== undefined),
    (s) => s.metrics!.diskPercent!
  );
  const maxUptime = Math.max(0, ...servers.map((s) => s.metrics?.uptimeSeconds ?? 0));

  return (
    <div className="min-h-screen bg-bg p-6 font-sans text-white">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="mono text-lg font-semibold tracking-tight">INFRASTRUCTURE</h1>
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <StatusDot color={allOffline.length === 0 && critical.length === 0 ? "healthy" : "critical"} pulse />
            {allOffline.length === 0 && critical.length === 0 ? "ALL SYSTEMS OPERATIONAL" : `${critical.length + allOffline.length} ISSUES`}
          </span>
        </div>
        <div className="mono flex items-center gap-4 text-sm text-status-muted">
          {now && <span>{now.toLocaleTimeString([], { hour12: false })}</span>}
          <button
            onClick={() => document.documentElement.requestFullscreen()}
            className="flex items-center gap-1 rounded-md border border-bg-border px-2 py-1 hover:text-white"
          >
            <Maximize2 size={12} /> Fullscreen
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <BigStat label="CPU" value={`${cpu.toFixed(0)}%`} />
        <BigStat label="RAM" value={`${ram.toFixed(0)}%`} />
        <BigStat label="Disk" value={disk ? `${disk.toFixed(0)}%` : "—"} />
        <BigStat label="Network" value={allOffline.length === 0 ? "NORMAL" : "DEGRADED"} />
        <BigStat label="Uptime" value={formatUptimeSeconds(maxUptime)} />
      </div>

      <div className="mb-6 rounded-lg border border-bg-border bg-bg-panel p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-status-muted">Services</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 lg:grid-cols-3">
          {allProcesses.map(({ server, proc, health }) => (
            <div key={`${server.id}:${proc.name}`} className="mono flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 truncate">
                <StatusDot color={health.color} pulse={health.color === "healthy"} />
                {proc.name.toUpperCase()}
              </span>
              <span className="flex gap-3 text-xs text-status-muted">
                <span>{health.label}</span>
                <span>{formatBytes(proc.memoryBytes)}</span>
                <span>{proc.restarts} restarts</span>
              </span>
            </div>
          ))}
          {allProcesses.length === 0 && <p className="text-sm text-status-muted">No services discovered yet.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-bg-border bg-bg-panel p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-status-muted">Recent Events</h2>
        <div className="mono space-y-1 text-xs">
          {recentEvents.map(({ serverId, log }, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-status-muted">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
              <span className={log.level === "error" ? "text-status-critical" : "text-status-warning"}>
                {log.processName}
              </span>
              <span className="truncate text-gray-300">{log.message}</span>
            </div>
          ))}
          {recentEvents.length === 0 && <p className="text-status-muted">No warnings or errors recently.</p>}
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel p-4 text-center">
      <div className="mono text-3xl font-bold">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-status-muted">{label}</div>
    </div>
  );
}
