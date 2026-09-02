"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { ServerSnapshot } from "@infra-monitor/shared";
import { StatusDot } from "./StatusDot";
import { combineHealth } from "@/lib/health";
import { formatBytes, formatDuration, formatRelativeTime } from "@/lib/format";

interface Row {
  serverId: string;
  serverName: string;
  processName: string;
  cpu: number;
  memory: number;
  uptime: number | null;
  restarts: number;
  status: ReturnType<typeof combineHealth>;
  responseMs: number | null;
  lastError: string | null;
}

type SortKey = "processName" | "cpu" | "memory" | "restarts" | "responseMs";

export function ServiceTable({ servers, filter }: { servers: ServerSnapshot[]; filter?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("processName");
  const [sortDesc, setSortDesc] = useState(false);
  const [search, setSearch] = useState("");

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const server of servers) {
      for (const proc of server.processes) {
        const health = server.health[proc.name];
        out.push({
          serverId: server.id,
          serverName: server.name,
          processName: proc.name,
          cpu: proc.cpuPercent,
          memory: proc.memoryBytes,
          uptime: proc.uptimeMs,
          restarts: proc.restarts,
          status: combineHealth(proc, health, server.connectionStatus),
          responseMs: health?.responseTimeMs ?? null,
          lastError: health && !health.ok ? health.error ?? `HTTP ${health.statusCode}` : null,
        });
      }
    }
    return out;
  }, [servers]);

  const filtered = rows.filter((r) => {
    const q = (search || filter || "").toLowerCase();
    if (!q) return true;
    return r.processName.toLowerCase().includes(q) || r.serverName.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "processName") cmp = a.processName.localeCompare(b.processName);
    else cmp = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    return sortDesc ? -cmp : cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  const columns: { key: SortKey | null; label: string }[] = [
    { key: null, label: "STATUS" },
    { key: "processName", label: "SERVICE" },
    { key: null, label: "SERVER" },
    { key: "cpu", label: "CPU" },
    { key: "memory", label: "MEMORY" },
    { key: null, label: "UPTIME" },
    { key: "restarts", label: "RESTARTS" },
    { key: "responseMs", label: "RESPONSE" },
    { key: null, label: "LAST ERROR" },
  ];

  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel">
      {!filter && (
        <div className="border-b border-bg-border p-3">
          <input
            placeholder="Filter services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-md border border-bg-border bg-bg-raised px-3 py-1.5 text-sm text-white outline-none focus:border-status-info"
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-bg-border text-[11px] uppercase tracking-wide text-status-muted">
              {columns.map((col) => (
                <th
                  key={col.label}
                  onClick={() => col.key && toggleSort(col.key)}
                  className={clsx("px-4 py-2.5 font-medium", col.key && "cursor-pointer select-none hover:text-white")}
                >
                  {col.label}
                  {sortKey === col.key && (sortDesc ? " ↓" : " ↑")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={`${row.serverId}:${row.processName}`}
                className="border-b border-bg-border/60 transition hover:bg-bg-raised/60"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusDot color={row.status.color} pulse={row.status.color === "healthy"} />
                    <span className="text-xs font-medium">{row.status.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/services/${row.serverId}/${encodeURIComponent(row.processName)}`}
                    className="font-medium text-white hover:text-status-info"
                  >
                    {row.processName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-status-muted">{row.serverName}</td>
                <td className="mono px-4 py-2.5">{row.cpu.toFixed(1)}%</td>
                <td className="mono px-4 py-2.5">{formatBytes(row.memory)}</td>
                <td className="mono px-4 py-2.5 text-status-muted">{formatDuration(row.uptime)}</td>
                <td className="mono px-4 py-2.5">{row.restarts}</td>
                <td className="mono px-4 py-2.5 text-status-muted">
                  {row.responseMs !== null ? `${row.responseMs}ms` : "—"}
                </td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-status-critical">{row.lastError ?? "—"}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-status-muted">
                  No services discovered yet. Register a server and install the agent to see PM2 processes here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
