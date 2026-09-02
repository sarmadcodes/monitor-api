import type { WebSocket } from "ws";
import type { ApiToDashboardMessage } from "@infra-monitor/shared";
import { store } from "../store";

const dashboardSockets = new Set<WebSocket>();
const HEARTBEAT_INTERVAL_MS = 30000;

export function handleDashboardConnection(socket: WebSocket) {
  dashboardSockets.add(socket);
  // Lazy require to avoid a circular import at module-eval time (incidents.ts
  // imports broadcastToDashboards from this file).
  const { listIncidents } = require("../incidents") as typeof import("../incidents");

  const snapshot: ApiToDashboardMessage = {
    type: "snapshot",
    servers: store.allSnapshots(),
    incidents: listIncidents(),
  };
  socket.send(JSON.stringify(snapshot));

  let alive = true;
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

  socket.on("close", () => {
    clearInterval(heartbeat);
    dashboardSockets.delete(socket);
  });
}

export function broadcastToDashboards(message: ApiToDashboardMessage) {
  const payload = JSON.stringify(message);
  for (const socket of dashboardSockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}
