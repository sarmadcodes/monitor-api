import pm2 from "pm2";
import type { PM2ProcessInfo, ProcessStatus } from "@infra-monitor/shared";

function mapStatus(pm2Status: string | undefined): ProcessStatus {
  switch (pm2Status) {
    case "online":
      return "online";
    case "stopped":
    case "stopping":
      return "stopped";
    case "errored":
      return "errored";
    case "launching":
    case "restarting":
    case "one-launch-status":
      return "restarting";
    default:
      return "unknown";
  }
}

function detectPort(env: Record<string, unknown> | undefined): number | null {
  if (!env) return null;
  const candidates = ["PORT", "APP_PORT", "SERVER_PORT"];
  for (const key of candidates) {
    const value = env[key];
    if (value !== undefined) {
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

export function listPm2Processes(): Promise<PM2ProcessInfo[]> {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) {
        reject(err);
        return;
      }
      const processes: PM2ProcessInfo[] = list.map((proc) => {
        const env = (proc.pm2_env ?? {}) as Record<string, unknown>;
        return {
          pm2Id: proc.pm_id ?? -1,
          name: proc.name ?? "unknown",
          status: mapStatus(env.status as string | undefined),
          pid: proc.pid ?? null,
          cpuPercent: proc.monit?.cpu ?? 0,
          memoryBytes: proc.monit?.memory ?? 0,
          uptimeMs:
            typeof env.pm_uptime === "number" && env.status === "online"
              ? Date.now() - (env.pm_uptime as number)
              : null,
          restarts: (env.restart_time as number) ?? 0,
          mode: (env.exec_mode as string) ?? "unknown",
          instances: (env.instances as number) ?? 1,
          interpreter: (env.exec_interpreter as string) ?? null,
          scriptPath: (env.pm_exec_path as string) ?? null,
          cwd: (env.pm_cwd as string) ?? null,
          createdAt: (env.created_at as number) ?? null,
          port: detectPort(env.env as Record<string, unknown> | undefined),
        };
      });
      resolve(processes);
    });
  });
}

export function connectPm2(): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => (err ? reject(err) : resolve()));
  });
}

const ALLOWED_ACTIONS = ["restart", "reload", "stop", "start"] as const;
export type Pm2Action = (typeof ALLOWED_ACTIONS)[number];

export async function runPm2Action(action: Pm2Action, processName: string): Promise<void> {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new Error(`Action not allowed: ${action}`);
  }
  // Validate the process actually exists before touching anything —
  // never pass through an arbitrary/unvalidated identifier to pm2.
  const known = await listPm2Processes();
  const match = known.find((p) => p.name === processName);
  if (!match) {
    throw new Error(`Unknown PM2 process: ${processName}`);
  }

  await new Promise<void>((resolve, reject) => {
    const cb = (err: Error | null) => (err ? reject(err) : resolve());
    if (action === "restart") pm2.restart(processName, cb);
    else if (action === "reload") pm2.reload(processName, cb);
    else if (action === "start") pm2.start(processName, cb);
    else pm2.stop(processName, cb);
  });
}
