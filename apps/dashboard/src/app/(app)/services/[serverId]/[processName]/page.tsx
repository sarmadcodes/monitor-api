"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { StatusDot } from "@/components/StatusDot";
import { LogViewer } from "@/components/LogViewer";
import { MetricTile } from "@/components/MetricTile";
import { useDashboardStore } from "@/lib/store";
import { api } from "@/lib/api";
import { combineHealth } from "@/lib/health";
import { formatBytes, formatDuration } from "@/lib/format";
import type { LogLine } from "@infra-monitor/shared";

type Tab = "overview" | "logs" | "health" | "configuration";
type ActionName = "restart" | "reload" | "stop" | "start";

export default function ServiceDetailPage() {
  const params = useParams<{ serverId: string; processName: string }>();
  const serverId = params.serverId;
  const processName = decodeURIComponent(params.processName);

  const server = useDashboardStore((s) => s.servers[serverId]);
  const liveLogs = useDashboardStore((s) => s.logsByServer[serverId] ?? []);
  const [tab, setTab] = useState<Tab>("overview");
  const [historicalLogs, setHistoricalLogs] = useState<LogLine[]>([]);
  const [healthUrl, setHealthUrlInput] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionName | null>(null);

  const proc = server?.processes.find((p) => p.name === processName);
  const health = server?.health[processName];

  useEffect(() => {
    api.getLogs(serverId, processName).then(setHistoricalLogs).catch(() => {});
  }, [serverId, processName]);

  const allLogs = useMemo(() => {
    const combined = [...historicalLogs, ...liveLogs.filter((l) => l.processName === processName)];
    const seen = new Set<string>();
    return combined.filter((l) => {
      const key = `${l.timestamp}:${l.raw}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historicalLogs, liveLogs, processName]);

  const errorLogs = allLogs.filter((l) => l.level === "error" || l.level === "fatal");

  async function runAction(action: ActionName) {
    setActionPending(action);
    setActionError(null);
    try {
      const fn = {
        restart: api.restartService,
        reload: api.reloadService,
        stop: api.stopService,
        start: api.startService,
      }[action];
      const result = await fn(serverId, processName);
      if (!result.ok) setActionError(result.error ?? "Action failed");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionPending(null);
      setConfirmAction(null);
    }
  }

  async function saveHealthUrl() {
    await api.setHealthUrl(serverId, processName, healthUrl || null);
  }

  if (!server) {
    return <p className="text-status-muted">Loading server…</p>;
  }

  if (!proc) {
    return (
      <p className="text-status-muted">
        Process &quot;{processName}&quot; not found on {server.name}. It may have been removed from PM2.
      </p>
    );
  }

  const status = combineHealth(proc, health, server.connectionStatus);
  const actions: ActionName[] = proc.status === "stopped" ? ["start"] : ["restart", "reload", "stop"];

  return (
    <>
      <div className="mb-1 text-xs">
        <Link href="/services" className="text-status-muted hover:text-white">
          Services
        </Link>
        <span className="text-status-muted"> / </span>
        <span className="text-status-muted">{proc.name}</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot color={status.color} pulse={status.color === "healthy"} />
            <h1 className="text-xl font-semibold text-white">{proc.name}</h1>
            <span className="mono text-xs text-status-muted">{status.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-status-muted">{server.name}</p>
        </div>
        <div className="flex gap-2">
          {actions.map((action) => (
            <button
              key={action}
              onClick={() => setConfirmAction(action)}
              disabled={actionPending !== null}
              className="rounded-md border border-bg-border px-3 py-1.5 text-sm capitalize text-status-muted transition hover:border-status-info hover:text-white disabled:opacity-50"
            >
              {actionPending === action ? "Working…" : action}
            </button>
          ))}
        </div>
      </div>

      {actionError && <p className="mb-4 text-sm text-status-critical">{actionError}</p>}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-lg border border-bg-border bg-bg-panel p-5">
            <h3 className="mb-2 font-semibold text-white capitalize">
              {confirmAction} {proc.name}?
            </h3>
            <p className="mb-4 text-sm text-status-muted">
              This will {confirmAction} the process on {server.name}. Confirm to proceed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-status-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => runAction(confirmAction)}
                className="rounded-md bg-status-critical px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              >
                Confirm {confirmAction}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b border-bg-border">
        {(["overview", "logs", "health", "configuration"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "border-b-2 px-3 py-2 text-sm capitalize transition",
              tab === t ? "border-status-info text-white" : "border-transparent text-status-muted hover:text-white"
            )}
          >
            {t}
            {t === "logs" && allLogs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-bg-raised px-1.5 py-0.5 text-[10px]">{allLogs.length}</span>
            )}
            {t === "health" && errorLogs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-status-critical/20 px-1.5 py-0.5 text-[10px] text-status-critical">
                {errorLogs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="CPU" value={`${proc.cpuPercent.toFixed(1)}%`} percent={proc.cpuPercent} />
            <MetricTile label="Memory" value={formatBytes(proc.memoryBytes)} />
            <MetricTile label="Restarts" value={String(proc.restarts)} />
            <MetricTile label="Uptime" value={formatDuration(proc.uptimeMs)} />
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-bg-border bg-bg-panel p-5 text-sm md:grid-cols-3">
            <Field label="PID" value={proc.pid ? String(proc.pid) : "—"} />
            <Field label="Port" value={proc.port ? String(proc.port) : "—"} />
            <Field label="Mode" value={proc.mode} />
            <Field label="Instances" value={String(proc.instances)} />
            <Field label="Interpreter" value={proc.interpreter ?? "—"} />
            <Field label="Node version" value={server.metrics?.nodeVersion ?? "—"} />
            <Field label="Script" value={proc.scriptPath ?? "—"} />
            <Field label="Working dir" value={proc.cwd ?? "—"} />
            {health && (
              <>
                <Field label="Last HTTP status" value={health.statusCode ? String(health.statusCode) : "—"} />
                <Field label="Response time" value={health.responseTimeMs ? `${health.responseTimeMs}ms` : "—"} />
              </>
            )}
          </div>
        </div>
      )}

      {tab === "logs" && <LogViewer logs={allLogs} />}

      {tab === "health" && (
        <div className="space-y-4">
          {health ? (
            <div className="rounded-lg border border-bg-border bg-bg-panel p-5">
              <div className="mb-3 flex items-center gap-2">
                <StatusDot color={health.ok ? "healthy" : "critical"} />
                <span className="font-medium text-white">{health.ok ? "HEALTHY" : "UNHEALTHY"}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Field label="URL" value={health.url} />
                <Field label="HTTP status" value={health.statusCode ? String(health.statusCode) : "—"} />
                <Field label="Response time" value={health.responseTimeMs ? `${health.responseTimeMs}ms` : "—"} />
              </div>
              {health.error && <p className="mt-3 text-sm text-status-critical">{health.error}</p>}
            </div>
          ) : (
            <p className="text-status-muted">No health check configured for this service.</p>
          )}

          <div className="rounded-lg border border-bg-border bg-bg-panel p-5">
            <h3 className="mb-2 text-sm font-semibold text-white">Health check URL</h3>
            <div className="flex gap-2">
              <input
                value={healthUrl}
                onChange={(e) => setHealthUrlInput(e.target.value)}
                placeholder="https://api.example.com/health"
                className="flex-1 rounded-md border border-bg-border bg-bg-raised px-3 py-2 text-sm text-white outline-none focus:border-status-info"
              />
              <button
                onClick={saveHealthUrl}
                className="rounded-md bg-status-info px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-status-muted">
              Checked every 15 seconds. If the URL is HTTPS, its SSL certificate is also tracked automatically.
            </p>
          </div>

          {errorLogs.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Recent errors</h3>
              <LogViewer logs={errorLogs} />
            </div>
          )}
        </div>
      )}

      {tab === "configuration" && (
        <div className="rounded-lg border border-bg-border bg-bg-panel p-5 text-sm">
          <p className="text-status-muted">
            Deployment and Git configuration is not connected yet — this requires the GitHub integration
            (a later phase). Currently discovered from PM2:
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field label="Script" value={proc.scriptPath ?? "—"} />
            <Field label="Working dir" value={proc.cwd ?? "—"} />
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-status-muted">{label}</div>
      <div className="mono mt-0.5 break-all text-white">{value}</div>
    </div>
  );
}
