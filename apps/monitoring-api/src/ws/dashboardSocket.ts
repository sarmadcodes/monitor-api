import type { WebSocket } from "ws";
import type { ApiToDashboardMessage } from "@infra-monitor/shared";
import { store } from "../store";

const dashboardSockets = new Set<WebSocket>();

export function handleDashboardConnection(socket: WebSocket) {
  dashboardSockets.add(socket);

  const snapshot: ApiToDashboardMessage = { type: "snapshot", servers: store.allSnapshots() };
  socket.send(JSON.stringify(snapshot));

  socket.on("close", () => {
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
