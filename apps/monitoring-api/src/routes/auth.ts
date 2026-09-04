import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config, smtpConfigured } from "../config";
import { signSession, verifySession, requireAuth, SESSION_COOKIE } from "../auth";
import { BLOCK_MESSAGE, isBlocked, listBlocked, recordFailedLogin, resetFailures, unblock } from "../loginSecurity";
import { createOtpChallenge, sendOtpEmail, verifyOtp } from "../otp";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const otpSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
});

function issueSession(reply: FastifyReply, username: string) {
  const token = signSession(username);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only mark the cookie Secure when the dashboard itself is served
    // over HTTPS — hardcoding `true` would silently break local dev
    // (http://localhost), where browsers refuse to store Secure cookies.
    secure: config.dashboardOrigin.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

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

        // Fail SAFE, not closed: if SMTP isn't configured (or breaks), never
        // let 2FA become a permanent lockout — a correct password alone is
        // enough in that case. This is a real design decision, not an
        // oversight: an admin locked out of their own single-admin system
        // because a Gmail app password expired is worse than the reduced
        // protection of skipping the second factor for that window.
        if (!smtpConfigured) {
          issueSession(reply, username);
          return reply.send({ ok: true, username, otpSkipped: true });
        }

        const { tempToken, code } = createOtpChallenge(username);
        await sendOtpEmail(username, code);
        return reply.send({ ok: true, otpRequired: true, tempToken });
      }

      const outcome = await recordFailedLogin(ip, req.headers["user-agent"] ?? null, username, password);
      if (outcome.action === "block") {
        return reply.code(403).send({ error: BLOCK_MESSAGE, blocked: true });
      }
      return reply.code(401).send({ error: "Invalid credentials" });
    }
  );

  app.post(
    "/api/auth/verify-otp",
    {
      config: {
        rateLimit: { max: 15, timeWindow: "5 minutes" },
      },
    },
    async (req, reply) => {
      const ip = req.ip;
      if (isBlocked(ip)) {
        return reply.code(403).send({ error: BLOCK_MESSAGE, blocked: true });
      }

      const parsed = otpSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }

      const result = verifyOtp(parsed.data.tempToken, parsed.data.code);
      if (result.ok) {
        issueSession(reply, result.username);
        return reply.send({ ok: true, username: result.username });
      }

      if (result.reason === "wrong_code") {
        // Wrong OTP guesses count toward the same 3-strikes IP block as
        // wrong passwords — otherwise 2FA would just move the brute-force
        // target from the password to a 6-digit code with no consequence.
        const outcome = await recordFailedLogin(ip, req.headers["user-agent"] ?? null, "(otp)", parsed.data.code);
        if (outcome.action === "block") {
          return reply.code(403).send({ error: BLOCK_MESSAGE, blocked: true });
        }
        return reply.code(401).send({ error: "Incorrect code" });
      }

      const messages = {
        not_found: "This code has expired or was already used. Log in again.",
        expired: "This code expired. Log in again.",
        too_many_attempts: "Too many wrong attempts. Log in again.",
      } as const;
      return reply.code(401).send({ error: messages[result.reason] });
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
