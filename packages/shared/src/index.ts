// Shared types for the agent <-> monitoring-api <-> dashboard protocol.

export type ProcessStatus =
  | "online"
  | "stopped"
  | "errored"
  | "restarting"
  | "unknown";

export type HealthStatus = "healthy" | "unhealthy" | "unknown";

export type ServerConnectionStatus = "online" | "offline";

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

export interface LogLine {
  processName: string;
  stream: "stdout" | "stderr";
  timestamp: number;
  level: "debug" | "info" | "warn" | "error" | "fatal" | "unknown";
  message: string;
  raw: string;
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

// ---- Agent -> API messages ----

export type AgentToApiMessage =
  | { type: "hello"; token: string; agentVersion: string; hostname: string }
  | { type: "metrics"; data: SystemMetrics }
  | { type: "processes"; data: PM2ProcessInfo[] }
  | { type: "log"; data: LogLine }
  | { type: "health"; data: HealthCheckResult }
  | { type: "action:result"; requestId: string; ok: boolean; error?: string };

// ---- API -> Agent messages ----

export type ApiToAgentMessage =
  | { type: "welcome"; serverId: string }
  | { type: "action:restart"; requestId: string; processName: string }
  | { type: "action:reload"; requestId: string; processName: string }
  | { type: "action:stop"; requestId: string; processName: string };

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
}

export type ApiToDashboardMessage =
  | { type: "snapshot"; servers: ServerSnapshot[] }
  | { type: "server:update"; server: ServerSnapshot }
  | { type: "server:offline"; serverId: string; lastSeen: number }
  | { type: "server:online"; serverId: string }
  | { type: "log:new"; serverId: string; data: LogLine }
  | { type: "health:update"; serverId: string; data: HealthCheckResult };

export type DashboardToApiMessage =
  | { type: "action:restart"; serverId: string; processName: string }
  | { type: "action:reload"; serverId: string; processName: string }
  | { type: "action:stop"; serverId: string; processName: string };
