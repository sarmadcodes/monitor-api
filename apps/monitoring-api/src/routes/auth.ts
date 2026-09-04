import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { signSession, verifySession, requireAuth, SESSION_COOKIE } from "../auth";
import { BLOCK_MESSAGE, isBlocked, listBlocked, recordFailedLogin, resetFailures, unblock } from "../loginSecurity";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/login",
    {
      config: {
        // Brute-force protection: far stricter than the API's global limit.
        rateLimit: { max: 8, timeWindow: "5 minutes" },
      },
    },
    async (req, reply) => {
      const ip = req.ip;
      if (isBlocked(ip)) {
        return reply.code(403).send({ error: BLOCK_MESSAGE, blocked: true });
      }

      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }
      const { username, password } = parsed.data;

      if (username === config.adminUsername && password === config.adminPassword) {
        resetFailures(ip);
        const token = signSession(username);
        reply
          .setCookie(SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: "lax",
            // Only mark the cookie Secure when the dashboard itself is served
            // over HTTPS — hardcoding `true` would silently break local dev
            // (http://localhost), where browsers refuse to store Secure cookies.
            secure: config.dashboardOrigin.startsWith("https"),
            path: "/",
            maxAge: 60 * 60 * 12,
          })
          .send({ ok: true, username });
        return;
      }

      const outcome = await recordFailedLogin(ip, req.headers["user-agent"] ?? null, username, password);
      if (outcome.action === "block") {
        return reply.code(403).send({ error: BLOCK_MESSAGE, blocked: true });
      }
      return reply.code(401).send({ error: "Invalid credentials" });
    }
  );

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" }).send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const session = token ? verifySession(token) : null;
    if (!session) return reply.code(401).send({ error: "Unauthorized" });
    reply.send({ username: session.sub });
  });

  // Authenticated-only: view/lift IP blocks. If you ever lock yourself out
  // (e.g. testing from your own IP), the only recovery is editing
  // BLOCKED_IPS_FILE directly on the VPS and restarting the API — documented
  // in the README.
  app.get("/api/auth/blocked-ips", { preHandler: requireAuth }, async () => listBlocked());
  app.post("/api/auth/blocked-ips/:ip/unblock", { preHandler: requireAuth }, async (req, reply) => {
    const { ip } = req.params as { ip: string };
    unblock(ip);
    reply.send({ ok: true });
  });
}
