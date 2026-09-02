import { nanoid } from "nanoid";
import type {
  HealthCheckResult,
  Incident,
  IncidentSeverity,
  PM2ProcessInfo,
  SslCertInfo,
  SystemMetrics,
} from "@infra-monitor/shared";
import { broadcastToDashboards } from "./ws/dashboardSocket";
import { store } from "./store";

const incidents = new Map<string, Incident>();
const openIndex = new Map<string, string>(); // dedupe key -> incident id

function key(serverId: string, processName: string | null, kind: Incident["kind"]) {
  return `${serverId}:${processName ?? "-"}:${kind}`;
}

function open(
  serverId: string,
  processName: string | null,
  kind: Incident["kind"],
  severity: IncidentSeverity,
  message: string
) {
  const server = store.getServer(serverId);
  if (!server) return;
  const k = key(serverId, processName, kind);
  const existingId = openIndex.get(k);
  if (existingId) {
    const existing = incidents.get(existingId);
    if (existing && existing.status !== "resolved") return; // already open, don't spam
  }
  const incident: Incident = {
    id: nanoid(12),
    serverId,
    serverName: server.name,
    processName,
    kind,
    severity,
    message,
    detectedAt: Date.now(),
    resolvedAt: null,
    status: "open",
  };
  incidents.set(incident.id, incident);
  openIndex.set(k, incident.id);
  broadcastToDashboards({ type: "incident:created", incident });
}

function resolve(serverId: string, processName: string | null, kind: Incident["kind"]) {
  const k = key(serverId, processName, kind);
  const id = openIndex.get(k);
  if (!id) return;
  const incident = incidents.get(id);
  if (!incident || incident.status === "resolved") return;
  incident.status = "resolved";
  incident.resolvedAt = Date.now();
  broadcastToDashboards({ type: "incident:updated", incident });
  openIndex.delete(k);
}

// A transient event (a single restart) has no ongoing condition to clear —
// record it as open, then auto-resolve shortly after so it still shows up
// in the incident log with a real resolution time instead of hanging open.
function openTransient(serverId: string, processName: string | null, kind: Incident["kind"], severity: IncidentSeverity, message: string, autoResolveMs = 60000) {
  open(serverId, processName, kind, severity, message);
  setTimeout(() => resolve(serverId, processName, kind), autoResolveMs);
}

const CPU_THRESHOLD = 90;
const MEM_THRESHOLD = 90;
const DISK_THRESHOLD = 85;
const SSL_WARN_DAYS = 14;

export function evaluateMetrics(serverId: string, metrics: SystemMetrics) {
  if (metrics.cpuUsagePercent >= CPU_THRESHOLD) {
    open(serverId, null, "cpu_threshold", "warning", `CPU usage at ${metrics.cpuUsagePercent.toFixed(0)}%`);
  } else {
    resolve(serverId, null, "cpu_threshold");
  }

  const memPercent = (metrics.memUsedBytes / metrics.memTotalBytes) * 100;
  if (memPercent >= MEM_THRESHOLD) {
    open(serverId, null, "memory_threshold", "warning", `Memory usage at ${memPercent.toFixed(0)}%`);
  } else {
    resolve(serverId, null, "memory_threshold");
  }

  if (metrics.diskPercent !== null) {
    if (metrics.diskPercent >= DISK_THRESHOLD) {
      open(serverId, null, "disk_threshold", "warning", `Disk usage at ${metrics.diskPercent.toFixed(0)}%`);
    } else {
      resolve(serverId, null, "disk_threshold");
    }
  }
}

export function evaluateProcesses(serverId: string, processes: PM2ProcessInfo[]) {
  const live = store.getLive(serverId);
  if (!live) return;

  for (const proc of processes) {
    const prevRestarts = live.restartCounts[proc.name];
    if (prevRestarts !== undefined && proc.restarts > prevRestarts) {
      openTransient(
        serverId,
        proc.name,
        "restart_spike",
        proc.restarts - prevRestarts >= 3 ? "critical" : "warning",
        `${proc.name} restarted (${prevRestarts} → ${proc.restarts})`
      );
    }
    live.restartCounts[proc.name] = proc.restarts;

    if (proc.status === "errored") {
      open(serverId, proc.name, "process_crash", "critical", `${proc.name} is in an errored state`);
    } else {
      resolve(serverId, proc.name, "process_crash");
    }
  }
}

export function evaluateHealth(serverId: string, result: HealthCheckResult) {
  if (!result.ok) {
    open(
      serverId,
      result.processName,
      "health_check_failed",
      "critical",
      result.error ?? `HTTP ${result.statusCode ?? "?"} from ${result.url}`
    );
  } else {
    resolve(serverId, result.processName, "health_check_failed");
  }
}

export function evaluateSsl(serverId: string, result: SslCertInfo) {
  if (result.daysRemaining !== null && result.daysRemaining <= 0) {
    open(serverId, result.domain, "ssl_expired", "critical", `SSL certificate for ${result.domain} has expired`);
    resolve(serverId, result.domain, "ssl_expiring");
  } else if (result.daysRemaining !== null && result.daysRemaining <= SSL_WARN_DAYS) {
    open(
      serverId,
      result.domain,
      "ssl_expiring",
      "warning",
      `SSL certificate for ${result.domain} expires in ${result.daysRemaining} day(s)`
    );
    resolve(serverId, result.domain, "ssl_expired");
  } else {
    resolve(serverId, result.domain, "ssl_expiring");
    resolve(serverId, result.domain, "ssl_expired");
  }
}

export function reportServerOffline(serverId: string) {
  open(serverId, null, "server_offline", "critical", "Agent disconnected");
}

export function reportServerOnline(serverId: string) {
  resolve(serverId, null, "server_offline");
}

export function listIncidents(): Incident[] {
  return Array.from(incidents.values()).sort((a, b) => b.detectedAt - a.detectedAt);
}

export function acknowledgeIncident(id: string): Incident | undefined {
  const incident = incidents.get(id);
  if (!incident) return undefined;
  if (incident.status === "open") incident.status = "acknowledged";
  broadcastToDashboards({ type: "incident:updated", incident });
  return incident;
}

export function resolveIncidentManually(id: string): Incident | undefined {
  const incident = incidents.get(id);
  if (!incident) return undefined;
  incident.status = "resolved";
  incident.resolvedAt = Date.now();
  broadcastToDashboards({ type: "incident:updated", incident });
  for (const [k, v] of openIndex) {
    if (v === id) openIndex.delete(k);
  }
  return incident;
}
