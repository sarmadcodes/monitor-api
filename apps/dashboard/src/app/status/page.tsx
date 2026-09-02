"use client";

import { useEffect, useState } from "react";
import { StatusDot, type DotColor } from "@/components/StatusDot";
import { api } from "@/lib/api";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import type { PublicHealthStatus, PublicStatusResponse } from "@infra-monitor/shared";

const STATUS_COLOR: Record<PublicHealthStatus, DotColor> = {
  operational: "healthy",
  degraded: "warning",
  offline: "critical",
  unknown: "muted",
};

const STATUS_LABEL: Record<PublicHealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  offline: "Offline",
  unknown: "Unknown",
};

const POLL_INTERVAL_MS = 15000;

export default function PublicStatusPage() {
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getPublicStatus();
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg px-4 py-12 font-sans text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <h1 className="mono text-2xl font-bold tracking-tight">
            SARMADS<span className="text-status-info">.TECH</span>
          </h1>
          <p className="mt-1 text-sm text-status-muted">Infrastructure Status</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-status-critical/30 bg-status-critical/[0.06] p-4 text-center text-sm text-status-critical">
            Unable to load status right now. Retrying automatically.
          </div>
        )}

        {data && (
          <>
            <div className="mb-8 flex items-center justify-center gap-2 rounded-lg border border-bg-border bg-bg-panel py-4">
              <StatusDot color={STATUS_COLOR[data.overallStatus]} pulse={data.overallStatus === "operational"} />
              <span className="font-medium">
                {data.overallStatus === "operational"
                  ? "All Systems Operational"
                  : data.overallStatus === "degraded"
                    ? "Partial Degradation"
                    : data.overallStatus === "offline"
                      ? "Major Outage"
                      : "Status Unavailable"}
              </span>
            </div>

            <div className="space-y-3">
              {data.servers.map((server) => (
                <div key={server.name} className="rounded-lg border border-bg-border bg-bg-panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      <StatusDot color={STATUS_COLOR[server.status]} pulse={server.status === "operational"} />
                      {server.name}
                    </span>
                    <span className="mono text-xs text-status-muted">{STATUS_LABEL[server.status]}</span>
                  </div>
                  <div className="mono grid grid-cols-3 gap-3 text-center text-sm">
                    <Metric label="CPU" value={server.cpuPercent !== null ? `${server.cpuPercent}%` : "—"} />
                    <Metric label="RAM" value={server.ramPercent !== null ? `${server.ramPercent}%` : "—"} />
                    <Metric label="Disk" value={server.diskPercent !== null ? `${server.diskPercent}%` : "—"} />
                  </div>
                  <div className="mt-3 flex justify-between border-t border-bg-border pt-3 text-xs text-status-muted">
                    <span>
                      {server.servicesHealthy}/{server.servicesTotal} services healthy
                    </span>
                    <span>{server.uptimeSeconds !== null ? formatDuration(server.uptimeSeconds * 1000) : ""}</span>
                  </div>
                </div>
              ))}
              {data.servers.length === 0 && (
                <p className="text-center text-sm text-status-muted">No public status information available.</p>
              )}
            </div>

            <p className="mono mt-8 text-center text-[11px] text-status-muted">
              Updated {formatRelativeTime(data.generatedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-status-muted">{label}</div>
    </div>
  );
}
