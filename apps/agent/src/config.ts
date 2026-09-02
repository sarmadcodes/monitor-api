import "dotenv/config";

export const config = {
  agentToken: process.env.AGENT_TOKEN ?? "",
  apiWsUrl: process.env.API_WS_URL ?? "ws://localhost:4000/agent",
  metricsIntervalMs: Number(process.env.METRICS_INTERVAL_MS ?? 5000),
  processIntervalMs: Number(process.env.PROCESS_INTERVAL_MS ?? 5000),
  agentVersion: "0.1.0",
};

if (!config.agentToken) {
  console.error("AGENT_TOKEN is required (see .env.example)");
  process.exit(1);
}
