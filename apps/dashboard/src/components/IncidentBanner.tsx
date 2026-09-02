"use client";

import Link from "next/link";
import { useDashboardStore } from "@/lib/store";
import { StatusDot } from "./StatusDot";
import { formatRelativeTime } from "@/lib/format";

export function IncidentBanner() {
  const incidents = useDashboardStore((s) => Object.values(s.incidents));
  const open = incidents.filter((i) => i.status !== "resolved").sort((a, b) => b.detectedAt - a.detectedAt);

  if (open.length === 0) return null;

  const critical = open.filter((i) => i.severity === "critical");

  return (
    <div className="mb-6 rounded-lg border border-status-critical/30 bg-status-critical/[0.06] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          <StatusDot color={critical.length > 0 ? "critical" : "warning"} pulse />
          {open.length} active incident{open.length !== 1 ? "s" : ""}
        </span>
        <Link href="/incidents" className="text-xs text-status-info hover:underline">
          View all
        </Link>
      </div>
      <div className="space-y-1">
        {open.slice(0, 3).map((incident) => (
          <div key={incident.id} className="mono flex items-center gap-2 text-xs">
            <StatusDot color={incident.severity === "critical" ? "critical" : "warning"} />
            <span className="text-status-muted">{formatRelativeTime(incident.detectedAt)}</span>
            <span className="text-white">{incident.serverName}</span>
            {incident.processName && <span className="text-status-info/80">{incident.processName}</span>}
            <span className="truncate text-gray-300">{incident.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
