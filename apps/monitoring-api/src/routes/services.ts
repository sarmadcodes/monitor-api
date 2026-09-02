import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../auth";
import { sendToAgent } from "../ws/agentSocket";
import { waitForAction } from "../pendingActions";
import type { ApiToAgentMessage } from "@infra-monitor/shared";

const actionSchema = z.object({
  serverId: z.string().min(1),
  processName: z.string().min(1),
});

async function handleAction(
  action: "restart" | "reload" | "stop" | "start",
  serverId: string,
  processName: string
) {
  const requestId = nanoid(16);
  const message: ApiToAgentMessage = { type: `action:${action}`, requestId, processName };
  const sent = sendToAgent(serverId, message);
  if (!sent) {
    return { ok: false, error: "Agent is not connected" };
  }
  return waitForAction(requestId);
}

export async function serviceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  for (const action of ["restart", "reload", "stop", "start"] as const) {
    app.post(`/api/services/${action}`, async (req, reply) => {
      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request" });
      const result = await handleAction(action, parsed.data.serverId, parsed.data.processName);
      if (!result.ok) return reply.code(502).send(result);
      reply.send(result);
    });
  }
}
