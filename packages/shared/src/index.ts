// Shared types for the agent <-> monitoring-api <-> dashboard protocol.

export type ProcessStatus =
  | "online"
  | "stopped"
  | "errored"
  | "restarting"
  | "unknown";

export type HealthStatus = "healthy" | "unhealthy" | "unknown";

export type ServerConnectionStatus = "online" | "offline" | "degraded";

export interface SystemMetrics {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  cpuCount: number;
  cpuUsagePercent: number;
  loadAvg: [number, number, number];
  memTotalBytes: number;
  memUsedBytes: number;
  memFreeBytes: number;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskPercent: number | null;
  netRxBytesPerSec: number;
  netTxBytesPerSec: number;
  uptimeSeconds: number;
  nodeVersion: string;
  pm2Version: string | null;
  temperatureC: number | null;
}

export interface PM2ProcessInfo {
  pm2Id: number;
  name: string;
  status: ProcessStatus;
  pid: number | null;
  cpuPercent: number;
  memoryBytes: number;
  uptimeMs: number | null;
  restarts: number;
  mode: string;
  instances: number;
  interpreter: string | null;
  scriptPath: string | null;
  cwd: string | null;
  createdAt: number | null;
  port: number | null;
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

export interface LogLine {
  source: "pm2" | "nginx" | "agent";
  processName: string;
  stream: "stdout" | "stderr";
  timestamp: number;
  level: LogLevel;
  message: string;
  raw: string;
}

const VALID_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error", "fatal", "unknown"]);

// Pino (used by several of these apps) logs numeric level codes, not words:
// 10=trace 20=debug 30=info 40=warn 50=error 60=fatal. Bunyan uses the same
// scale. Anything else unrecognized becomes "unknown" rather than being
// silently dropped by level-filtered UIs — a log line must never vanish
// just because its source used a level format we didn't expect.
const NUMERIC_LEVEL_MAP: Record<number, LogLevel> = {
  10: "debug",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export function normalizeLogLevel(input: unknown): LogLevel {
  if (typeof input === "number") {
    return NUMERIC_LEVEL_MAP[input] ?? "unknown";
  }
  if (typeof input === "string") {
    const lower = input.trim().toLowerCase();
    if (VALID_LEVELS.has(lower)) return lower as LogLevel;
    const asNumber = Number(lower);
    if (!Number.isNaN(asNumber)) return NUMERIC_LEVEL_MAP[asNumber] ?? "unknown";
  }
  return "unknown";
}

export interface HealthCheckResult {
  processName: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: number;
}

export interface NginxStatus {
  installed: boolean;
  active: boolean;
  version: string | null;
}

export interface SslCertInfo {
  domain: string;
  valid: boolean;
  issuer: string | null;
  expiresAt: number | null;
  daysRemaining: number | null;
  error: string | null;
  checkedAt: number;
}

export type IncidentSeverity = "critical" | "warning" | "info";
export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface Incident {
  id: string;
  serverId: string;
  serverName: string;
  processName: string | null;
  kind:
    | "process_crash"
    | "restart_spike"
    | "server_offline"
    | "server_online"
    | "cpu_threshold"
    | "memory_threshold"
    | "disk_threshold"
    | "health_check_failed"
    | "ssl_expiring"
    | "ssl_expired";
  severity: IncidentSeverity;
  message: string;
  detectedAt: number;
  resolvedAt: number | null;
  status: IncidentStatus;
}

// ---- Agent -> API messages ----

export type AgentToApiMessage =
  | { type: "hello"; token: string; agentVersion: string; hostname: string }
  | { type: "metrics"; data: SystemMetrics }
  | { type: "processes"; data: PM2ProcessInfo[] }
  | { type: "log:batch"; data: LogLine[] }
  | { type: "health"; data: HealthCheckResult }
  | { type: "nginx"; data: NginxStatus }
  | { type: "action:result"; requestId: string; ok: boolean; error?: string };

// ---- API -> Agent messages ----

export type ApiToAgentMessage =
  | { type: "welcome"; serverId: string }
  | { type: "action:restart"; requestId: string; processName: string }
  | { type: "action:reload"; requestId: string; processName: string }
  | { type: "action:stop"; requestId: string; processName: string }
  | { type: "action:start"; requestId: string; processName: string };

// ---- API -> Dashboard messages (broadcast over separate WS) ----

export interface ServerSnapshot {
  id: string;
  name: string;
  environment: string;
  connectionStatus: ServerConnectionStatus;
  lastSeen: number | null;
  metrics: SystemMetrics | null;
  processes: PM2ProcessInfo[];
  health: Record<string, HealthCheckResult>;
  nginx: NginxStatus | null;
  ssl: Record<string, SslCertInfo>;
  isPublicStatusEnabled: boolean;
}

export type ApiToDashboardMessage =
  | { type: "snapshot"; servers: ServerSnapshot[]; incidents: Incident[] }
  | { type: "server:update"; server: ServerSnapshot }
  | { type: "server:offline"; serverId: string; lastSeen: number }
  | { type: "server:online"; serverId: string }
  | { type: "log:batch"; serverId: string; serverName: string; data: LogLine[] }
  | { type: "health:update"; serverId: string; data: HealthCheckResult }
  | { type: "ssl:update"; serverId: string; data: SslCertInfo }
  | { type: "incident:created"; incident: Incident }
  | { type: "incident:updated"; incident: Incident };

// ---- Public, unauthenticated status page ----
// Deliberately a separate, hand-picked shape — never derived by stripping
// fields off ServerSnapshot, so a future field added there can't leak here
// by accident.

export type PublicHealthStatus = "operational" | "degraded" | "offline" | "unknown";

export interface PublicServerStatus {
  name: string;
  status: PublicHealthStatus;
  cpuPercent: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  uptimeSeconds: number | null;
  servicesTotal: number;
  servicesHealthy: number;
  servicesDegraded: number;
  lastUpdated: number | null;
}

export interface PublicStatusResponse {
  overallStatus: PublicHealthStatus;
  generatedAt: number;
  servers: PublicServerStatus[];
}

export type DashboardToApiMessage =
  | { type: "action:restart"; serverId: string; processName: string }
  | { type: "action:reload"; serverId: string; processName: string }
  | { type: "action:stop"; serverId: string; processName: string }
  | { type: "action:start"; serverId: string; processName: string };
