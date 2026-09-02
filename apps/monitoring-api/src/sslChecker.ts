import tls from "node:tls";
import type { SslCertInfo } from "@infra-monitor/shared";
import { store } from "./store";
import { broadcastToDashboards } from "./ws/dashboardSocket";
import { evaluateSsl } from "./incidents";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // certs don't change often
const TIMEOUT_MS = 8000;

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function checkDomain(domain: string): Promise<SslCertInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, timeout: TIMEOUT_MS, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve({ domain, valid: false, issuer: null, expiresAt: null, daysRemaining: null, error: "No certificate returned", checkedAt: Date.now() });
          return;
        }
        const expiresAt = new Date(cert.valid_to).getTime();
        const daysRemaining = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        resolve({
          domain,
          valid: socket.authorized || daysRemaining > 0,
          issuer: firstString(cert.issuer?.O) ?? firstString(cert.issuer?.CN) ?? null,
          expiresAt,
          daysRemaining,
          error: null,
          checkedAt: Date.now(),
        });
      }
    );
    socket.on("error", (err) => {
      resolve({ domain, valid: false, issuer: null, expiresAt: null, daysRemaining: null, error: err.message, checkedAt: Date.now() });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ domain, valid: false, issuer: null, expiresAt: null, daysRemaining: null, error: "Connection timed out", checkedAt: Date.now() });
    });
  });
}

function domainsForServer(healthUrls: Record<string, string>): string[] {
  const domains = new Set<string>();
  for (const url of Object.values(healthUrls)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") domains.add(parsed.hostname);
    } catch {
      // ignore invalid URL
    }
  }
  return Array.from(domains);
}

async function runOnce() {
  for (const server of store.listServers()) {
    for (const domain of domainsForServer(server.healthUrls)) {
      const result = await checkDomain(domain);
      store.updateSsl(server.id, result);
      broadcastToDashboards({ type: "ssl:update", serverId: server.id, data: result });
      evaluateSsl(server.id, result);
    }
  }
}

export function startSslChecker() {
  runOnce();
  setInterval(runOnce, CHECK_INTERVAL_MS);
}
