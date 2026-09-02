import WebSocket from "ws";
import type { AgentToApiMessage, ApiToAgentMessage } from "@infra-monitor/shared";
import { config } from "./config";
import { collectSystemMetrics } from "./system";
import { connectPm2, listPm2Processes, runPm2Action } from "./pm2";
import { startLogTailing } from "./logs";

let socket: WebSocket | null = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
let metricsTimer: NodeJS.Timeout | null = null;
let processTimer: NodeJS.Timeout | null = null;

function send(message: AgentToApiMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function stopTimers() {
  if (metricsTimer) clearInterval(metricsTimer);
  if (processTimer) clearInterval(processTimer);
  metricsTimer = null;
  processTimer = null;
}

async function handleAgentAction(msg: ApiToAgentMessage) {
  if (msg.type === "welcome") {
    console.log(`[agent] connected, assigned server id ${msg.serverId}`);
    return;
  }

  const actionMap = { "action:restart": "restart", "action:reload": "reload", "action:stop": "stop" } as const;
  const action = actionMap[msg.type as keyof typeof actionMap];
  if (!action) return;

  try {
    await runPm2Action(action, msg.processName);
    send({ type: "action:result", requestId: msg.requestId, ok: true });
  } catch (err) {
    send({
      type: "action:result",
      requestId: msg.requestId,
      ok: false,
      error: err instanceof Error ? err.message : "action failed",
    });
  }
}

function connect() {
  console.log(`[agent] connecting to ${config.apiWsUrl}`);
  socket = new WebSocket(config.apiWsUrl);

  socket.on("open", () => {
    reconnectDelayMs = 1000;
    send({
      type: "hello",
      token: config.agentToken,
      agentVersion: config.agentVersion,
      hostname: require("node:os").hostname(),
    });

    stopTimers();
    metricsTimer = setInterval(async () => {
      try {
        send({ type: "metrics", data: await collectSystemMetrics() });
      } catch (err) {
        console.error("[agent] metrics collection failed", err);
      }
    }, config.metricsIntervalMs);

    processTimer = setInterval(async () => {
      try {
        send({ type: "processes", data: await listPm2Processes() });
      } catch (err) {
        console.error("[agent] pm2 list failed", err);
      }
    }, config.processIntervalMs);
  });

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ApiToAgentMessage;
      handleAgentAction(msg);
    } catch {
      // ignore malformed messages
    }
  });

  socket.on("close", () => {
    stopTimers();
    console.warn(`[agent] disconnected, retrying in ${reconnectDelayMs}ms`);
    setTimeout(connect, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  });

  socket.on("error", (err) => {
    console.error("[agent] socket error", err.message);
  });
}

async function main() {
  await connectPm2();
  startLogTailing((log) => send({ type: "log", data: log }));
  connect();
}

main().catch((err) => {
  console.error("[agent] fatal", err);
  process.exit(1);
});
