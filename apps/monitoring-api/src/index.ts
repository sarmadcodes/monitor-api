import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { config } from "./config";
import { authRoutes } from "./routes/auth";
import { serverRoutes } from "./routes/servers";
import { serviceRoutes } from "./routes/services";
import { handleAgentConnection } from "./ws/agentSocket";
import { handleDashboardConnection } from "./ws/dashboardSocket";
import { startHealthChecker } from "./healthChecker";
import { verifySession, SESSION_COOKIE } from "./auth";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.dashboardOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(websocket);

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(serverRoutes);
  await app.register(serviceRoutes);

  // Agents connect outbound here and authenticate via a "hello" message
  // carrying their per-server token (see packages/shared AgentToApiMessage).
  app.register(async (instance) => {
    instance.get("/agent", { websocket: true }, (socket) => {
      handleAgentConnection(socket as any);
    });
  });

  // Dashboard clients connect here; auth is via the same session cookie
  // used for REST calls.
  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket, req) => {
      const token = (req.cookies as Record<string, string>)[SESSION_COOKIE];
      const session = token ? verifySession(token) : null;
      if (!session) {
        socket.close(4401, "unauthorized");
        return;
      }
      handleDashboardConnection(socket as any);
    });
  });

  startHealthChecker();

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
