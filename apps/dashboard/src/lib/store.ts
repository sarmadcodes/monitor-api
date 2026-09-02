import { create } from "zustand";
import type { LogLine, ServerSnapshot } from "@infra-monitor/shared";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface DashboardState {
  servers: Record<string, ServerSnapshot>;
  logsByServer: Record<string, LogLine[]>;
  wsStatus: WsStatus;
  lastUpdate: number | null;
  setWsStatus: (status: WsStatus) => void;
  setSnapshot: (servers: ServerSnapshot[]) => void;
  upsertServer: (server: ServerSnapshot) => void;
  markOffline: (serverId: string, lastSeen: number) => void;
  markOnline: (serverId: string) => void;
  appendLog: (serverId: string, log: LogLine) => void;
  applyHealth: (serverId: string, data: import("@infra-monitor/shared").HealthCheckResult) => void;
}

const MAX_LOGS_PER_SERVER = 1000;

export const useDashboardStore = create<DashboardState>((set) => ({
  servers: {},
  logsByServer: {},
  wsStatus: "connecting",
  lastUpdate: null,

  setWsStatus: (status) => set({ wsStatus: status }),

  setSnapshot: (servers) =>
    set(() => {
      const map: Record<string, ServerSnapshot> = {};
      for (const s of servers) map[s.id] = s;
      return { servers: map, lastUpdate: Date.now() };
    }),

  upsertServer: (server) =>
    set((state) => ({
      servers: { ...state.servers, [server.id]: server },
      lastUpdate: Date.now(),
    })),

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

  appendLog: (serverId, log) =>
    set((state) => {
      const existing = state.logsByServer[serverId] ?? [];
      const next = [...existing, log];
      if (next.length > MAX_LOGS_PER_SERVER) next.splice(0, next.length - MAX_LOGS_PER_SERVER);
      return { logsByServer: { ...state.logsByServer, [serverId]: next } };
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
}));
