import WebSocket from "ws";
import os from "node:os";
import type { AgentToApiMessage, ApiToAgentMessage, LogLine } from "@infra-monitor/shared";
import { config } from "./config";
import { collectSystemMetrics } from "./system";
import { connectPm2, listPm2Processes, runPm2Action } from "./pm2";
import { startLogTailing } from "./logs";
import { checkNginxStatus } from "./nginx";

let socket: WebSocket | null = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
let metricsTimer: NodeJS.Timeout | null = null;
let processTimer: NodeJS.Timeout | null = null;
let nginxTimer: NodeJS.Timeout | null = null;
let logFlushTimer: NodeJS.Timeout | null = null;

// Batch log lines instead of sending one WS frame per line — under load
// (a busy access log) that would otherwise flood the socket and the
// dashboard's re-render loop. Flushed on a short timer or once full.
let logBuffer: LogLine[] = [];
const LOG_FLUSH_INTERVAL_MS = 250;
const LOG_FLUSH_MAX_BATCH = 300;

function send(message: AgentToApiMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function flushLogs() {
  if (logBuffer.length === 0) return;
  const batch = logBuffer;
  logBuffer = [];
  send({ type: "log:batch", data: batch });
}

function queueLog(log: LogLine) {
  logBuffer.push(log);
  if (logBuffer.length >= LOG_FLUSH_MAX_BATCH) flushLogs();
}

function stopTimers() {
  if (metricsTimer) clearInterval(metricsTimer);
  if (processTimer) clearInterval(processTimer);
  if (nginxTimer) clearInterval(nginxTimer);
  metricsTimer = null;
  processTimer = null;
  nginxTimer = null;
}

async function handleAgentAction(msg: ApiToAgentMessage) {
  if (msg.type === "welcome") {
    console.log(`[agent] connected, assigned server id ${msg.serverId}`);
    return;
  }

  const actionMap = {
    "action:restart": "restart",
    "action:reload": "reload",
    "action:stop": "stop",
    "action:start": "start",
  } as const;
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
      hostname: os.hostname(),
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

    nginxTimer = setInterval(async () => {
      try {
        send({ type: "nginx", data: await checkNginxStatus() });
      } catch (err) {
        console.error("[agent] nginx check failed", err);
      }
    }, 20000);
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

  // The `ws` library auto-replies to protocol-level pings from the API with
  // pongs — no application code needed on this side for that heartbeat.
}

async function main() {
  await connectPm2();
  startLogTailing(queueLog);
  logFlushTimer = setInterval(flushLogs, LOG_FLUSH_INTERVAL_MS);
  connect();
}

main().catch((err) => {
  console.error("[agent] fatal", err);
  process.exit(1);
});
