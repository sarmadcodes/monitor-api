import type { HealthCheckResult, PM2ProcessInfo, ServerConnectionStatus } from "@infra-monitor/shared";
import type { DotColor } from "@/components/StatusDot";

export interface CombinedHealth {
  label: string;
  color: DotColor;
}

// PM2 "online" doesn't mean the app is actually serving traffic — combine
// process status with the HTTP health check (when one is configured) so a
// process that's up but returning 502s still reads as unhealthy.
export function combineHealth(
  proc: PM2ProcessInfo,
  health: HealthCheckResult | undefined,
  serverConnection: ServerConnectionStatus
): CombinedHealth {
  if (serverConnection === "offline") {
    return { label: "UNREACHABLE", color: "muted" };
  }
  if (proc.status === "errored") {
    return { label: "ERRORED", color: "critical" };
  }
  if (proc.status === "stopped") {
    return { label: "STOPPED", color: "muted" };
  }
  if (proc.status === "restarting") {
    return { label: "RESTARTING", color: "warning" };
  }
  if (proc.status === "unknown") {
    return { label: "UNKNOWN", color: "muted" };
  }
  // online
  if (health) {
    if (!health.ok) return { label: "UNHEALTHY", color: "critical" };
    if (health.responseTimeMs !== null && health.responseTimeMs > 1500) {
      return { label: "SLOW", color: "warning" };
    }
  }
  return { label: "ONLINE", color: "healthy" };
}
