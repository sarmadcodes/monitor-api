import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { signSession, verifySession, SESSION_COOKIE } from "../auth";

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
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request" });
    }
    const { username, password } = parsed.data;
    if (username !== config.adminUsername || password !== config.adminPassword) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
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
  });

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" }).send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const session = token ? verifySession(token) : null;
    if (!session) return reply.code(401).send({ error: "Unauthorized" });
    reply.send({ username: session.sub });
  });
}
