import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  HealthCheckResult,
  LogLine,
  NginxStatus,
  PM2ProcessInfo,
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
    };
  }

  allSnapshots(): ServerSnapshot[] {
    return this.listServers()
      .map((s) => this.toSnapshot(s.id))
      .filter((s): s is ServerSnapshot => !!s);
  }
}

export const store = new Store();
