import type { HealthCheckResult } from "@infra-monitor/shared";
import { store } from "./store";
import { broadcastToDashboards } from "./ws/dashboardSocket";
import { evaluateHealth } from "./incidents";

const CHECK_INTERVAL_MS = 15000;
const TIMEOUT_MS = 8000;

async function checkOne(processName: string, url: string): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    return {
      processName,
      url,
      ok: res.status < 400,
      statusCode: res.status,
      responseTimeMs: Date.now() - start,
      error: null,
      checkedAt: Date.now(),
    };
  } catch (err) {
    return {
      processName,
      url,
      ok: false,
      statusCode: null,
      responseTimeMs: null,
      error: err instanceof Error ? err.message : "request failed",
      checkedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runOnce() {
  for (const server of store.listServers()) {
    const entries = Object.entries(server.healthUrls);
    for (const [processName, url] of entries) {
      const result = await checkOne(processName, url);
      store.updateHealth(server.id, result);
      broadcastToDashboards({ type: "health:update", serverId: server.id, data: result });
      evaluateHealth(server.id, result);
    }
  }
}

export function startHealthChecker() {
  runOnce();
  setInterval(runOnce, CHECK_INTERVAL_MS);
}
