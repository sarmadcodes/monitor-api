import fs from "node:fs";
import readline from "node:readline";
import pm2 from "pm2";
import type { LogLine } from "@infra-monitor/shared";

interface WatchedFile {
  path: string;
  size: number;
}

const watched = new Map<string, WatchedFile>(); // key: `${processName}:${stream}`

function detectLevel(line: string): LogLine["level"] {
  const lower = line.toLowerCase();
  if (/\bfatal\b/.test(lower)) return "fatal";
  if (/\berror\b/.test(lower)) return "error";
  if (/\bwarn(ing)?\b/.test(lower)) return "warn";
  if (/\bdebug\b/.test(lower)) return "debug";
  if (/\binfo\b/.test(lower)) return "info";
  return "unknown";
}

function parseLine(processName: string, stream: "stdout" | "stderr", raw: string): LogLine {
  let message = raw;
  let level: LogLine["level"] = stream === "stderr" ? "error" : "unknown";
  let timestamp = Date.now();

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      message = String(parsed.message ?? parsed.msg ?? raw);
      if (parsed.level) level = String(parsed.level).toLowerCase() as LogLine["level"];
      if (parsed.timestamp) {
        const t = Date.parse(parsed.timestamp);
        if (!Number.isNaN(t)) timestamp = t;
      }
    }
  } catch {
    level = detectLevel(raw);
  }

  return { processName, stream, timestamp, level, message, raw };
}

function tailNewLines(key: string, filePath: string, onLine: (raw: string) => void) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }

  const prev = watched.get(key);
  const startSize = prev?.size ?? stat.size; // on first sight, skip existing content
  if (stat.size < startSize) {
    // file was truncated/rotated
    watched.set(key, { path: filePath, size: 0 });
    return;
  }
  if (stat.size === startSize) {
    watched.set(key, { path: filePath, size: stat.size });
    return;
  }

  const stream = fs.createReadStream(filePath, { start: startSize, end: stat.size });
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    if (line.trim().length > 0) onLine(line);
  });
  rl.on("close", () => {
    watched.set(key, { path: filePath, size: stat.size });
  });
}

export function startLogTailing(onLine: (log: LogLine) => void, intervalMs = 2000) {
  const poll = () => {
    pm2.list((err, list) => {
      if (err) return;
      for (const proc of list) {
        const env = (proc.pm2_env ?? {}) as Record<string, unknown>;
        const name = proc.name ?? "unknown";
        const outPath = env.pm_out_log_path as string | undefined;
        const errPath = env.pm_err_log_path as string | undefined;
        if (outPath) {
          tailNewLines(`${name}:stdout`, outPath, (raw) => onLine(parseLine(name, "stdout", raw)));
        }
        if (errPath) {
          tailNewLines(`${name}:stderr`, errPath, (raw) => onLine(parseLine(name, "stderr", raw)));
        }
      }
    });
  };

  poll();
  setInterval(poll, intervalMs);
}
