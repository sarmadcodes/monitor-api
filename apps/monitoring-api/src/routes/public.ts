import type { FastifyInstance } from "fastify";
import { store } from "../store";

let cached: { body: ReturnType<typeof store.publicStatus>; expiresAt: number } | null = null;
const CACHE_MS = 5000; // brief cache so a burst of visitors doesn't hammer the store

export async function publicRoutes(app: FastifyInstance) {
  // No auth, deliberately isolated from the authenticated API surface, and
  // rate-limited separately (see index.ts) so it can't be used to probe or
  // load-test the rest of the system.
  app.get(
    "/api/public/status",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (_req, reply) => {
      const now = Date.now();
      if (!cached || cached.expiresAt < now) {
        cached = { body: store.publicStatus(), expiresAt: now + CACHE_MS };
      }
      reply.header("Cache-Control", "public, max-age=5").send(cached.body);
    }
  );
}
