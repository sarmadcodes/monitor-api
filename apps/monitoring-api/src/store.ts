import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  HealthCheckResult,
  LogLine,
  NginxStatus,
  PM2ProcessInfo,
  PublicServerStatus,
  PublicStatusResponse,
  ServerConnectionStatus,
  ServerSnapshot,
  SslCertInfo,
  SystemMetrics,
} from "@infra-monitor/shared";
import { config } from "./config";

export interface RegisteredServer {
  id: string;
  name: string;
  description: string;
  environment: string;
  agentToken: string;
  createdAt: number;
  healthUrls: Record<string, string>;
  isPublicStatusEnabled: boolean;
}

interface PersistedData {
  servers: RegisteredServer[];
}

function loadPersisted(): PersistedData {
  try {
    const raw = fs.readFileSync(config.dataFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { servers: [] };
  }
}

function savePersisted(data: PersistedData) {
  const dir = path.dirname(config.dataFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2));
}

// ---- live (in-memory) state for connected agents ----

export interface LiveServerState {
  connectionStatus: ServerConnectionStatus;
  lastSeen: number | null;
  metrics: SystemMetrics | null;
  processes: PM2ProcessInfo[];
  health: Record<string, HealthCheckResult>;
  nginx: NginxStatus | null;
  ssl: Record<string, SslCertInfo>;
  recentLogs: LogLine[]; // ring buffer, most recent last
  restartCounts: Record<string, number>; // last-seen restart count, for spike detection
}

const MAX_RECENT_LOGS = 2000;

function freshLiveState(): LiveServerState {
  return {
    connectionStatus: "offline",
    lastSeen: null,
    metrics: null,
    processes: [],
    health: {},
    nginx: null,
    ssl: {},
    recentLogs: [],
    restartCounts: {},
  };
}

class Store {
  private servers = new Map<string, RegisteredServer>();
  private live = new Map<string, LiveServerState>();

  constructor() {
    const persisted = loadPersisted();
    for (const s of persisted.servers) {
      s.healthUrls = s.healthUrls ?? {};
      s.isPublicStatusEnabled = s.isPublicStatusEnabled ?? false;
      this.servers.set(s.id, s);
      this.live.set(s.id, freshLiveState());
    }
  }

  private persist() {
    savePersisted({ servers: Array.from(this.servers.values()) });
  }

  registerServer(name: string, description: string, environment: string): RegisteredServer {
    const server: RegisteredServer = {
      id: nanoid(12),
      name,
      description,
      environment,
      agentToken: nanoid(32),
      createdAt: Date.now(),
      healthUrls: {},
      isPublicStatusEnabled: false,
    };
    this.servers.set(server.id, server);
    this.live.set(server.id, freshLiveState());
    this.persist();
    return server;
  }

  removeServer(id: string) {
    this.servers.delete(id);
    this.live.delete(id);
    this.persist();
  }

  rotateToken(id: string): RegisteredServer | undefined {
    const server = this.servers.get(id);
    if (!server) return undefined;
    server.agentToken = nanoid(32);
    this.persist();
    return server;
  }

  setPublicStatusEnabled(id: string, enabled: boolean): RegisteredServer | undefined {
    const server = this.servers.get(id);
    if (!server) return undefined;
    server.isPublicStatusEnabled = enabled;
    this.persist();
    return server;
  }

  setHealthUrl(id: string, processName: string, url: string | null) {
    const server = this.servers.get(id);
    if (!server) return;
    if (url) {
      server.healthUrls[processName] = url;
    } else {
      delete server.healthUrls[processName];
    }
    this.persist();
  }

  listServers(): RegisteredServer[] {
    return Array.from(this.servers.values());
  }

  getServer(id: string): RegisteredServer | undefined {
    return this.servers.get(id);
  }

  findByToken(token: string): RegisteredServer | undefined {
    return Array.from(this.servers.values()).find((s) => s.agentToken === token);
  }

  getLive(id: string): LiveServerState | undefined {
    return this.live.get(id);
  }

  setOnline(id: string) {
    const live = this.live.get(id);
    if (live) {
      live.connectionStatus = "online";
      live.lastSeen = Date.now();
    }
  }

  setOffline(id: string) {
    const live = this.live.get(id);
    if (live) {
      live.connectionStatus = "offline";
      live.lastSeen = Date.now();
    }
  }

  updateMetrics(id: string, metrics: SystemMetrics) {
    const live = this.live.get(id);
    if (live) {
      live.metrics = metrics;
      live.lastSeen = Date.now();
    }
  }

  updateProcesses(id: string, processes: PM2ProcessInfo[]) {
    const live = this.live.get(id);
    if (live) {
      live.processes = processes;
      live.lastSeen = Date.now();
    }
  }

  updateNginx(id: string, nginx: NginxStatus) {
    const live = this.live.get(id);
    if (live) live.nginx = nginx;
  }

  updateSsl(id: string, result: SslCertInfo) {
    const live = this.live.get(id);
    if (live) live.ssl[result.domain] = result;
  }

  pushLogs(id: string, logs: LogLine[]) {
    const live = this.live.get(id);
    if (!live || logs.length === 0) return;
    live.recentLogs.push(...logs);
    if (live.recentLogs.length > MAX_RECENT_LOGS) {
      live.recentLogs.splice(0, live.recentLogs.length - MAX_RECENT_LOGS);
    }
  }

  updateHealth(id: string, result: HealthCheckResult) {
    const live = this.live.get(id);
    if (live) {
      live.health[result.processName] = result;
    }
  }

  toSnapshot(id: string): ServerSnapshot | undefined {
    const server = this.servers.get(id);
    const live = this.live.get(id);
    if (!server || !live) return undefined;
    return {
      id: server.id,
      name: server.name,
      environment: server.environment,
      connectionStatus: live.connectionStatus,
      lastSeen: live.lastSeen,
      metrics: live.metrics,
      processes: live.processes,
      health: live.health,
      nginx: live.nginx,
      ssl: live.ssl,
      isPublicStatusEnabled: server.isPublicStatusEnabled,
    };
  }

  allSnapshots(): ServerSnapshot[] {
    return this.listServers()
      .map((s) => this.toSnapshot(s.id))
      .filter((s): s is ServerSnapshot => !!s);
  }

  // Hand-built public DTO — deliberately does NOT reuse ServerSnapshot or
  // spread the server object, so nothing (id, environment, health check
  // URLs, agent token, etc.) can leak here just because a field got added
  // elsewhere. Only servers with isPublicStatusEnabled=true are included.
  publicStatus(): PublicStatusResponse {
    const servers: PublicServerStatus[] = [];

    for (const server of this.listServers()) {
      if (!server.isPublicStatusEnabled) continue;
      const live = this.live.get(server.id);
      if (!live) continue;

      const m = live.metrics;
      const servicesTotal = live.processes.length;
      const servicesHealthy = live.processes.filter((p) => p.status === "online").length;
      const servicesDegraded = live.processes.filter(
        (p) => p.status === "errored" || p.status === "restarting"
      ).length;

      let status: PublicServerStatus["status"] = "unknown";
      if (live.connectionStatus === "offline") status = "offline";
      else if (servicesDegraded > 0) status = "degraded";
      else if (live.connectionStatus === "online") status = "operational";

      servers.push({
        name: server.name,
        status,
        cpuPercent: m ? Math.round(m.cpuUsagePercent) : null,
        ramPercent: m ? Math.round((m.memUsedBytes / m.memTotalBytes) * 100) : null,
        diskPercent: m?.diskPercent !== null && m?.diskPercent !== undefined ? Math.round(m.diskPercent) : null,
        uptimeSeconds: m?.uptimeSeconds ?? null,
        servicesTotal,
        servicesHealthy,
        servicesDegraded,
        lastUpdated: live.lastSeen,
      });
    }

    const overallStatus: PublicStatusResponse["overallStatus"] =
      servers.length === 0
        ? "unknown"
        : servers.some((s) => s.status === "offline")
          ? "offline"
          : servers.some((s) => s.status === "degraded")
            ? "degraded"
            : "operational";

    return { overallStatus, generatedAt: Date.now(), servers };
  }
}

export const store = new Store();
