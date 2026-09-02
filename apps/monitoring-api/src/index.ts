import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { authRoutes } from "./routes/auth";
import { serverRoutes } from "./routes/servers";
import { serviceRoutes } from "./routes/services";
import { incidentRoutes } from "./routes/incidents";
import { publicRoutes } from "./routes/public";
import { handleAgentConnection } from "./ws/agentSocket";
import { handleDashboardConnection } from "./ws/dashboardSocket";
import { startHealthChecker } from "./healthChecker";
import { startSslChecker } from "./sslChecker";
import { verifySession, SESSION_COOKIE } from "./auth";

async function main() {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(helmet, {
    // This API only ever serves JSON — no HTML, no inline scripts to allow —
    // so a maximally restrictive CSP is safe and doesn't need dashboard-side
    // tuning for fonts/styles/etc. (that config lives on the Next.js app).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(cors, {
    origin: config.dashboardOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(websocket);

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    // Never leak stack traces / internal error text to clients.
    reply.code(status).send({
      error: status < 500 ? err.message : "Internal server error",
    });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(publicRoutes);
  await app.register(authRoutes, {
    // Login gets a much stricter limit than the API default — brute force
    // protection. Other auth routes (logout, me) stay under the global cap.
  });
  await app.register(serverRoutes);
  await app.register(serviceRoutes);
  await app.register(incidentRoutes);

  // Agents connect outbound here and authenticate via a "hello" message
  // carrying their per-server token (see packages/shared AgentToApiMessage).
  // Exempt from HTTP rate limiting — this is a long-lived WebSocket
  // connection carrying metrics traffic, not a request burst to throttle.
  app.register(async (instance) => {
    instance.get("/agent", { websocket: true, config: { rateLimit: false } }, (socket) => {
      handleAgentConnection(socket as any);
    });
  });

  // Dashboard clients connect here; auth is via the same session cookie
  // used for REST calls. Also exempt from rate limiting for the same reason.
  app.register(async (instance) => {
    instance.get("/ws", { websocket: true, config: { rateLimit: false } }, (socket, req) => {
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
  startSslChecker();

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
