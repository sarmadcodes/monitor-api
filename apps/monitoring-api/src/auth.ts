import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config";

export const SESSION_COOKIE = "infra_session";

export function signSession(username: string): string {
  return jwt.sign({ sub: username }, config.jwtSecret, { expiresIn: "12h" });
}

export function verifySession(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as { sub: string };
  } catch {
    return null;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? verifySession(token) : null;
  if (!session) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}
