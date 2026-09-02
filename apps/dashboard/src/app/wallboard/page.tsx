"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { useRequireAuth } from "@/lib/useAuth";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useDashboardStore } from "@/lib/store";
import { StatusDot } from "@/components/StatusDot";
import { combineHealth } from "@/lib/health";
import { formatBytes, formatUptimeSeconds } from "@/lib/format";

export default function WallboardPage() {
  const status = useRequireAuth();
  useLiveConnection(status === "authed");
  const servers = useDashboardStore((s) => Object.values(s.servers));
  const globalLog = useDashboardStore((s) => s.globalLog);
  const incidents = useDashboardStore((s) => Object.values(s.incidents));
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (status === "loading") return null;

  const offline = servers.filter((s) => s.connectionStatus === "offline");
  const allProcesses = servers.flatMap((s) =>
    s.processes.map((p) => ({ server: s, proc: p, health: combineHealth(p, s.health[p.name], s.connectionStatus) }))
  );
  const critical = allProcesses.filter((p) => p.health.color === "critical");
  const openCritical = incidents.filter((i) => i.status !== "resolved" && i.severity === "critical");

  const total = allProcesses.length + servers.length;
  const bad = critical.length + offline.length;
  const healthPercent = total > 0 ? Math.max(0, ((total - bad) / total) * 100) : 100;
  const allGood = offline.length === 0 && critical.length === 0 && openCritical.length === 0;

  const avg = <T,>(items: T[], f: (t: T) => number) => (items.length ? items.reduce((a, b) => a + f(b), 0) / items.length : 0);
  const withMetrics = servers.filter((s) => s.metrics);
  const cpu = avg(withMetrics, (s) => s.metrics!.cpuUsagePercent);
  const ram = avg(withMetrics, (s) => (s.metrics!.memUsedBytes / s.metrics!.memTotalBytes) * 100);
  const diskServers = servers.filter((s) => s.metrics?.diskPercent !== null && s.metrics?.diskPercent !== undefined);
  const disk = avg(diskServers, (s) => s.metrics!.diskPercent!);
  const maxUptime = Math.max(0, ...servers.map((s) => s.metrics?.uptimeSeconds ?? 0));

  const events = [...globalLog].reverse().slice(0, 60);

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg p-6 font-sans text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mb-6 flex items-center justify-between text-xs text-status-muted">
        <span className="mono">{servers.length} SERVERS · {allProcesses.length} SERVICES</span>
        {now && <span className="mono">{now.toLocaleTimeString([], { hour12: false })}</span>}
        <button
          onClick={() => document.documentElement.requestFullscreen()}
          className="mono flex items-center gap-1 rounded-md border border-bg-border px-2 py-1 hover:text-white"
        >
          <Maximize2 size={12} /> Fullscreen
        </button>
      </div>

      <div className="relative mb-8 flex flex-col items-center">
        <h1 className="mono text-4xl font-bold tracking-[0.15em] text-white">
          SARMADS<span className="text-status-info">.TECH</span>
        </h1>
        <p className="mono mt-1 text-xs tracking-[0.3em] text-status-muted">INFRASTRUCTURE COMMAND CENTER</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="mono text-3xl font-bold">{healthPercent.toFixed(1)}%</span>
          <span className="flex items-center gap-2 text-sm font-medium">
            <StatusDot color={allGood ? "healthy" : bad > 0 ? "critical" : "warning"} pulse />
            {allGood ? "ALL SYSTEMS OPERATIONAL" : `${bad} ISSUE${bad !== 1 ? "S" : ""} DETECTED`}
          </span>
        </div>
      </div>

      <div className="relative mb-6 grid grid-cols-5 gap-4">
        <BigStat label="CPU" value={`${cpu.toFixed(0)}%`} />
        <BigStat label="RAM" value={`${ram.toFixed(0)}%`} />
        <BigStat label="Disk" value={diskServers.length ? `${disk.toFixed(0)}%` : "—"} />
        <BigStat label="Network" value={offline.length === 0 ? "NORMAL" : "DEGRADED"} />
        <BigStat label="Uptime" value={formatUptimeSeconds(maxUptime)} />
      </div>

      <div className="relative mb-6 rounded-lg border border-bg-border bg-bg-panel/80 p-4 backdrop-blur">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-status-muted">Servers</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => (
            <div key={s.id} className="mono flex items-center justify-between rounded-md border border-bg-border/60 px-3 py-2 text-xs">
              <span className="flex items-center gap-2">
                <StatusDot color={s.connectionStatus === "online" ? "healthy" : "critical"} pulse={s.connectionStatus === "online"} />
                {s.name.toUpperCase()}
              </span>
              {s.metrics ? (
                <span className="flex gap-3 text-status-muted">
                  <span>CPU {s.metrics.cpuUsagePercent.toFixed(0)}%</span>
                  <span>RAM {((s.metrics.memUsedBytes / s.metrics.memTotalBytes) * 100).toFixed(0)}%</span>
                  <span>{s.metrics.diskPercent !== null ? `DISK ${s.metrics.diskPercent.toFixed(0)}%` : "DISK —"}</span>
                </span>
              ) : (
                <span className="text-status-muted">offline</span>
              )}
            </div>
          ))}
          {servers.length === 0 && <p className="text-sm text-status-muted">No servers registered yet.</p>}
        </div>
      </div>

      <div className="relative mb-6 rounded-lg border border-bg-border bg-bg-panel/80 p-4 backdrop-blur">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-status-muted">Services</h2>
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

      <div className="relative rounded-lg border border-bg-border bg-bg-panel/80 p-4 backdrop-blur">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-status-muted">Live System Activity</h2>
        <div className="mono max-h-[280px] space-y-1 overflow-hidden text-xs">
          {events.map((log, i) => (
            <div
              key={`${log.serverId}:${log.timestamp}:${i}`}
              className={i === 0 ? "flash-update flex gap-3" : "flex gap-3"}
            >
              <span className="text-status-muted">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
              <span className="w-28 shrink-0 truncate text-status-info/80">{log.processName}</span>
              <span
                className={
                  log.level === "error" || log.level === "fatal"
                    ? "text-status-critical"
                    : log.level === "warn"
                      ? "text-status-warning"
                      : "text-gray-400"
                }
              >
                {log.level.toUpperCase()}
              </span>
              <span className="truncate text-gray-300">{log.message}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-status-muted">No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel/80 p-4 text-center backdrop-blur">
      <div className="mono text-3xl font-bold">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-status-muted">{label}</div>
    </div>
  );
}
