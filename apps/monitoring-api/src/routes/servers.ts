import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { store } from "../store";
import { requireAuth } from "../auth";
import { config } from "../config";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  environment: z.string().default("production"),
});

const healthUrlSchema = z.object({
  processName: z.string().min(1),
  url: z.string().url().nullable(),
});

export async function serverRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/servers", async () => {
    return store.allSnapshots();
  });

  app.get("/api/servers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const snap = store.toSnapshot(id);
    if (!snap) return reply.code(404).send({ error: "Not found" });
    return snap;
  });

  app.get("/api/servers/:id/logs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const live = store.getLive(id);
    if (!live) return reply.code(404).send({ error: "Not found" });
    const { process: processName } = req.query as { process?: string };
    const logs = processName
      ? live.recentLogs.filter((l) => l.processName === processName)
      : live.recentLogs;
    return logs;
  });

  app.get("/api/logs", async () => {
    const merged = store
      .listServers()
      .flatMap((server) => {
        const live = store.getLive(server.id);
        return (live?.recentLogs ?? []).map((log) => ({ ...log, serverId: server.id, serverName: server.name }));
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-1000);
    return merged;
  });

  app.post("/api/servers", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request" });
    const server = store.registerServer(parsed.data.name, parsed.data.description, parsed.data.environment);
    const hostname = req.hostname.includes(":") ? req.hostname.split(":")[0] : req.hostname;
    const apiUrl = process.env.PUBLIC_API_URL ?? `http://${hostname}:${config.port}`;
    reply.code(201).send({
      id: server.id,
      name: server.name,
      description: server.description,
      environment: server.environment,
      agentToken: server.agentToken,
      apiUrl,
      installCommand: `AGENT_TOKEN=${server.agentToken} AGENT_SERVER_ID=${server.id} API_URL=${apiUrl} bash install-agent.sh`,
    });
  });

  app.delete("/api/servers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    store.removeServer(id);
    reply.send({ ok: true });
  });

  app.post("/api/servers/:id/rotate-token", async (req, reply) => {
    const { id } = req.params as { id: string };
    const server = store.rotateToken(id);
    if (!server) return reply.code(404).send({ error: "Not found" });
    reply.send({ agentToken: server.agentToken });
  });

  app.post("/api/servers/:id/health-url", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = healthUrlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request" });
    const server = store.getServer(id);
    if (!server) return reply.code(404).send({ error: "Not found" });
    store.setHealthUrl(id, parsed.data.processName, parsed.data.url);
    reply.send({ ok: true });
  });
}
