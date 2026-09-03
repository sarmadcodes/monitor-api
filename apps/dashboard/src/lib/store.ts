import { create } from "zustand";
import type { HealthCheckResult, Incident, LogLine, ServerSnapshot, SslCertInfo } from "@infra-monitor/shared";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface GlobalLogEntry extends LogLine {
  serverId: string;
  serverName: string;
}

interface DashboardState {
  servers: Record<string, ServerSnapshot>;
  logsByServer: Record<string, LogLine[]>;
  globalLog: GlobalLogEntry[];
  incidents: Record<string, Incident>;
  wsStatus: WsStatus;
  lastUpdate: number | null;
  setWsStatus: (status: WsStatus) => void;
  setSnapshot: (servers: ServerSnapshot[], incidents: Incident[]) => void;
  upsertServer: (server: ServerSnapshot) => void;
  removeServer: (serverId: string) => void;
  markOffline: (serverId: string, lastSeen: number) => void;
  markOnline: (serverId: string) => void;
  appendLogBatch: (serverId: string, serverName: string, logs: LogLine[]) => void;
  applyHealth: (serverId: string, data: HealthCheckResult) => void;
  applySsl: (serverId: string, data: SslCertInfo) => void;
  upsertIncident: (incident: Incident) => void;
}

const MAX_LOGS_PER_SERVER = 2000;
const MAX_GLOBAL_LOG = 3000;

export const useDashboardStore = create<DashboardState>((set) => ({
  servers: {},
  logsByServer: {},
  globalLog: [],
  incidents: {},
  wsStatus: "connecting",
  lastUpdate: null,

  setWsStatus: (status) => set({ wsStatus: status }),

  setSnapshot: (servers, incidents) =>
    set(() => {
      const map: Record<string, ServerSnapshot> = {};
      for (const s of servers) map[s.id] = s;
      const incidentMap: Record<string, Incident> = {};
      for (const i of incidents) incidentMap[i.id] = i;
      return { servers: map, incidents: incidentMap, lastUpdate: Date.now() };
    }),

  upsertServer: (server) =>
    set((state) => ({
      servers: { ...state.servers, [server.id]: server },
      lastUpdate: Date.now(),
    })),

  removeServer: (serverId) =>
    set((state) => {
      const { [serverId]: _removed, ...rest } = state.servers;
      return { servers: rest };
    }),

  markOffline: (serverId, lastSeen) =>
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return {};
      return {
        servers: {
          ...state.servers,
          [serverId]: { ...existing, connectionStatus: "offline", lastSeen },
        },
        lastUpdate: Date.now(),
      };
    }),

  markOnline: (serverId) =>
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return {};
      return {
        servers: { ...state.servers, [serverId]: { ...existing, connectionStatus: "online" } },
        lastUpdate: Date.now(),
      };
    }),

  appendLogBatch: (serverId, serverName, logs) =>
    set((state) => {
      const existing = state.logsByServer[serverId] ?? [];
      const nextPerServer = [...existing, ...logs];
      if (nextPerServer.length > MAX_LOGS_PER_SERVER) {
        nextPerServer.splice(0, nextPerServer.length - MAX_LOGS_PER_SERVER);
      }

      const globalEntries: GlobalLogEntry[] = logs.map((l) => ({ ...l, serverId, serverName }));
      const nextGlobal = [...state.globalLog, ...globalEntries];
      if (nextGlobal.length > MAX_GLOBAL_LOG) {
        nextGlobal.splice(0, nextGlobal.length - MAX_GLOBAL_LOG);
      }

      return {
        logsByServer: { ...state.logsByServer, [serverId]: nextPerServer },
        globalLog: nextGlobal,
      };
    }),

  applyHealth: (serverId, data) =>
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return {};
      return {
        servers: {
          ...state.servers,
          [serverId]: { ...existing, health: { ...existing.health, [data.processName]: data } },
        },
      };
    }),

  applySsl: (serverId, data) =>
    set((state) => {
      const existing = state.servers[serverId];
      if (!existing) return {};
      return {
        servers: {
          ...state.servers,
          [serverId]: { ...existing, ssl: { ...existing.ssl, [data.domain]: data } },
        },
      };
    }),

  upsertIncident: (incident) =>
    set((state) => ({ incidents: { ...state.incidents, [incident.id]: incident } })),
}));
