import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth";
import { acknowledgeIncident, listIncidents, resolveIncidentManually } from "../incidents";
import { listAudit } from "../auditLog";

export async function incidentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/incidents", async () => listIncidents());
  app.get("/api/audit", async () => listAudit());

  app.post("/api/incidents/:id/acknowledge", async (req, reply) => {
    const { id } = req.params as { id: string };
    const incident = acknowledgeIncident(id);
    if (!incident) return reply.code(404).send({ error: "Not found" });
    reply.send(incident);
  });

  app.post("/api/incidents/:id/resolve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const incident = resolveIncidentManually(id);
    if (!incident) return reply.code(404).send({ error: "Not found" });
    reply.send(incident);
  });
}
