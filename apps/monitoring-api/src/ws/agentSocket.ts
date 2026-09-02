import type { WebSocket } from "ws";
import type { AgentToApiMessage, ApiToAgentMessage } from "@infra-monitor/shared";
import { store } from "../store";
import { resolveAction } from "../pendingActions";
import { broadcastToDashboards } from "./dashboardSocket";

// serverId -> live socket, so REST/dashboard actions can reach the right agent
export const agentSockets = new Map<string, WebSocket>();

export function handleAgentConnection(socket: WebSocket) {
  let serverId: string | null = null;

  socket.on("message", (raw) => {
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
      store.setOnline(server.id);
      const welcome: ApiToAgentMessage = { type: "welcome", serverId: server.id };
      socket.send(JSON.stringify(welcome));
      broadcastToDashboards({ type: "server:online", serverId: server.id });
      const snap = store.toSnapshot(server.id);
      if (snap) broadcastToDashboards({ type: "server:update", server: snap });
      return;
    }

    if (!serverId) return; // must say hello first

    switch (msg.type) {
      case "metrics": {
        store.updateMetrics(serverId, msg.data);
        const snap = store.toSnapshot(serverId);
        if (snap) broadcastToDashboards({ type: "server:update", server: snap });
        break;
      }
      case "processes": {
        store.updateProcesses(serverId, msg.data);
        const snap = store.toSnapshot(serverId);
        if (snap) broadcastToDashboards({ type: "server:update", server: snap });
        break;
      }
      case "log": {
        store.pushLog(serverId, msg.data);
        broadcastToDashboards({ type: "log:new", serverId, data: msg.data });
        break;
      }
      case "health": {
        store.updateHealth(serverId, msg.data);
        broadcastToDashboards({ type: "health:update", serverId, data: msg.data });
        break;
      }
      case "action:result": {
        resolveAction(msg.requestId, msg.ok, msg.error);
        break;
      }
    }
  });

  socket.on("close", () => {
    if (serverId) {
      agentSockets.delete(serverId);
      store.setOffline(serverId);
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
