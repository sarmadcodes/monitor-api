import type { WebSocket } from "ws";
import { normalizeLogLevel, type AgentToApiMessage, type ApiToAgentMessage } from "@infra-monitor/shared";
import { store } from "../store";
import { resolveAction } from "../pendingActions";
import { broadcastToDashboards } from "./dashboardSocket";
import { evaluateMetrics, evaluateProcesses, reportServerOffline, reportServerOnline } from "../incidents";

// serverId -> live socket, so REST/dashboard actions can reach the right agent
export const agentSockets = new Map<string, WebSocket>();

const HEARTBEAT_INTERVAL_MS = 20000;

export function handleAgentConnection(socket: WebSocket) {
  let serverId: string | null = null;
  let alive = true;

  // Protocol-level ping/pong catches a half-open TCP connection (agent's
  // process died without a clean close, network dropped silently) that
  // would otherwise leave the server showing "online" indefinitely.
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);

  socket.on("pong", () => {
    alive = true;
  });

  socket.on("message", (raw) => {
    alive = true;
    let msg: AgentToApiMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "hello") {
      const server = store.findByToken(msg.token);
      if (!server) {
        socket.close(4001, "invalid token");
        return;
      }
      serverId = server.id;
      agentSockets.set(server.id, socket);
      const wasOffline = store.getLive(server.id)?.connectionStatus !== "online";
      store.setOnline(server.id);
      const welcome: ApiToAgentMessage = { type: "welcome", serverId: server.id };
      socket.send(JSON.stringify(welcome));
      broadcastToDashboards({ type: "server:online", serverId: server.id });
      if (wasOffline) reportServerOnline(server.id);
      const snap = store.toSnapshot(server.id);
      if (snap) broadcastToDashboards({ type: "server:update", server: snap });
      return;
    }

    if (!serverId) return; // must say hello first

    switch (msg.type) {
      case "metrics": {
        store.updateMetrics(serverId, msg.data);
        evaluateMetrics(serverId, msg.data);
        const snap = store.toSnapshot(serverId);
        if (snap) broadcastToDashboards({ type: "server:update", server: snap });
        break;
      }
      case "processes": {
        store.updateProcesses(serverId, msg.data);
        evaluateProcesses(serverId, msg.data);
        const snap = store.toSnapshot(serverId);
        if (snap) broadcastToDashboards({ type: "server:update", server: snap });
        break;
      }
      case "log:batch": {
        // Defense in depth: re-validate level server-side too, so a future
        // agent build (or a different logger format) can never reintroduce
        // the bug where an unrecognized level value made lines vanish from
        // every level-filtered view instead of showing up as "unknown".
        const sanitized = msg.data.map((l) => ({ ...l, level: normalizeLogLevel(l.level) }));
        store.pushLogs(serverId, sanitized);
        const server = store.getServer(serverId);
        broadcastToDashboards({
          type: "log:batch",
          serverId,
          serverName: server?.name ?? "unknown",
          data: sanitized,
        });
        break;
      }
      case "health": {
        store.updateHealth(serverId, msg.data);
        broadcastToDashboards({ type: "health:update", serverId, data: msg.data });
        break;
      }
      case "nginx": {
        store.updateNginx(serverId, msg.data);
        const snap = store.toSnapshot(serverId);
        if (snap) broadcastToDashboards({ type: "server:update", server: snap });
        break;
      }
      case "action:result": {
        resolveAction(msg.requestId, msg.ok, msg.error);
        break;
      }
    }
  });

  socket.on("close", () => {
    clearInterval(heartbeat);
    if (serverId) {
      agentSockets.delete(serverId);
      store.setOffline(serverId);
      reportServerOffline(serverId);
      broadcastToDashboards({ type: "server:offline", serverId, lastSeen: Date.now() });
    }
  });
}

export function sendToAgent(serverId: string, message: ApiToAgentMessage): boolean {
  const socket = agentSockets.get(serverId);
  if (!socket || socket.readyState !== socket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}
