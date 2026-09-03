"use client";

import { useState } from "react";
import clsx from "clsx";
import { useDashboardStore } from "@/lib/store";
import { StatusDot } from "@/components/StatusDot";
import { api } from "@/lib/api";
import { formatRelativeTime, formatTime } from "@/lib/format";
import type { IncidentStatus } from "@infra-monitor/shared";

const FILTERS: Array<{ label: string; value: IncidentStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Resolved", value: "resolved" },
];

export default function IncidentsPage() {
  const incidents = useDashboardStore((s) => Object.values(s.incidents)).sort((a, b) => b.detectedAt - a.detectedAt);
  const upsertIncident = useDashboardStore((s) => s.upsertIncident);
  const [filter, setFilter] = useState<IncidentStatus | "all">("all");

  const filtered = filter === "all" ? incidents : incidents.filter((i) => i.status === filter);

  async function acknowledge(id: string) {
    const updated = await api.acknowledgeIncident(id);
    upsertIncident(updated);
  }

  async function resolve(id: string) {
    const updated = await api.resolveIncident(id);
    upsertIncident(updated);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Incidents</h1>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-xs",
                filter === f.value ? "bg-bg-raised text-white" : "text-status-muted hover:text-white"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: one card per incident. */}
      <div className="divide-y divide-bg-border rounded-lg border border-bg-border bg-bg-panel md:hidden">
        {filtered.map((incident) => (
          <div key={incident.id} className="px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-white">
                <StatusDot
                  color={incident.severity === "critical" ? "critical" : incident.severity === "warning" ? "warning" : "info"}
                />
                {incident.serverName}
              </span>
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  incident.status === "open" && "bg-status-critical/15 text-status-critical",
                  incident.status === "acknowledged" && "bg-status-warning/15 text-status-warning",
                  incident.status === "resolved" && "bg-status-healthy/15 text-status-healthy"
                )}
              >
                {incident.status}
              </span>
            </div>
            <p className="mb-1.5 text-sm text-gray-300">{incident.message}</p>
            <div className="mono flex flex-wrap gap-x-3 gap-y-1 text-xs text-status-muted">
              {incident.processName && <span className="text-status-info/80">{incident.processName}</span>}
              <span>{formatTime(incident.detectedAt)}</span>
              {incident.resolvedAt && <span>resolved {formatRelativeTime(incident.resolvedAt)}</span>}
            </div>
            {incident.status !== "resolved" && (
              <div className="mt-2 flex gap-2">
                {incident.status === "open" && (
                  <button
                    onClick={() => acknowledge(incident.id)}
                    className="min-h-[36px] rounded-md border border-bg-border px-3 text-xs text-status-muted"
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  onClick={() => resolve(incident.id)}
                  className="min-h-[36px] rounded-md border border-bg-border px-3 text-xs text-status-muted"
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-status-muted">
            No incidents{filter !== "all" ? ` with status "${filter}"` : ""}.
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-bg-border bg-bg-panel md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-bg-border text-[11px] uppercase tracking-wide text-status-muted">
              <th className="px-4 py-2.5">Severity</th>
              <th className="px-4 py-2.5">Detected</th>
              <th className="px-4 py-2.5">Server</th>
              <th className="px-4 py-2.5">Service</th>
              <th className="px-4 py-2.5">Condition</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Resolved</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((incident) => (
              <tr key={incident.id} className="border-b border-bg-border/60">
                <td className="px-4 py-2.5">
                  <StatusDot
                    color={
                      incident.severity === "critical" ? "critical" : incident.severity === "warning" ? "warning" : "info"
                    }
                  />
                </td>
                <td className="mono px-4 py-2.5 text-status-muted" title={new Date(incident.detectedAt).toISOString()}>
                  {formatTime(incident.detectedAt)}
                </td>
                <td className="px-4 py-2.5 text-white">{incident.serverName}</td>
                <td className="mono px-4 py-2.5 text-status-info/80">{incident.processName ?? "—"}</td>
                <td className="max-w-[320px] px-4 py-2.5 text-gray-300">{incident.message}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                      incident.status === "open" && "bg-status-critical/15 text-status-critical",
                      incident.status === "acknowledged" && "bg-status-warning/15 text-status-warning",
                      incident.status === "resolved" && "bg-status-healthy/15 text-status-healthy"
                    )}
                  >
                    {incident.status}
                  </span>
                </td>
                <td className="mono px-4 py-2.5 text-status-muted">
                  {incident.resolvedAt ? formatRelativeTime(incident.resolvedAt) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {incident.status === "open" && (
                    <button
                      onClick={() => acknowledge(incident.id)}
                      className="mr-2 rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white"
                    >
                      Acknowledge
                    </button>
                  )}
                  {incident.status !== "resolved" && (
                    <button
                      onClick={() => resolve(incident.id)}
                      className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white"
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-status-muted">
                  No incidents{filter !== "all" ? ` with status "${filter}"` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
