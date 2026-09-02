import fs from "node:fs";
import readline from "node:readline";
import pm2 from "pm2";
import { normalizeLogLevel, type LogLine } from "@infra-monitor/shared";

interface WatchEntry {
  path: string;
  size: number;
  source: LogLine["source"];
  processName: string;
  stream: "stdout" | "stderr";
  watcher: fs.FSWatcher | null;
  debounce: NodeJS.Timeout | null;
}

const watched = new Map<string, WatchEntry>(); // key: absolute file path

function detectLevel(line: string): LogLine["level"] {
  const lower = line.toLowerCase();
  if (/\bfatal\b/.test(lower)) return "fatal";
  if (/\berror\b/.test(lower)) return "error";
  if (/\bwarn(ing)?\b/.test(lower)) return "warn";
  if (/\bdebug\b/.test(lower)) return "debug";
  if (/\binfo\b/.test(lower)) return "info";
  return "unknown";
}

function parseLine(
  source: LogLine["source"],
  processName: string,
  stream: "stdout" | "stderr",
  raw: string
): LogLine {
  let message = raw;
  let level: LogLine["level"] = stream === "stderr" ? "error" : "unknown";
  let timestamp = Date.now();

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      message = String(parsed.message ?? parsed.msg ?? raw);
      if (parsed.level !== undefined) level = normalizeLogLevel(parsed.level);
      // Pino/Bunyan use a Unix-ms epoch number for `time`, not an ISO string.
      const rawTime = parsed.time ?? parsed.timestamp;
      if (typeof rawTime === "number") {
        timestamp = rawTime;
      } else if (typeof rawTime === "string") {
        const t = Date.parse(rawTime);
        if (!Number.isNaN(t)) timestamp = t;
      }
    }
  } catch {
    level = detectLevel(raw);
  }

  // nginx access lines: "... " status "..." — a 5xx should read as an error line.
  if (source === "nginx" && stream === "stdout") {
    const statusMatch = raw.match(/"\s(\d{3})\s/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    }
  }

  return { source, processName, stream, timestamp, level, message, raw };
}

function readNewBytes(entry: WatchEntry, onLine: (line: LogLine) => void) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(entry.path);
  } catch {
    return;
  }

  if (stat.size < entry.size) {
    // file was truncated/rotated — start from the top next time.
    entry.size = 0;
    return;
  }
  if (stat.size === entry.size) return;

  const startSize = entry.size;
  entry.size = stat.size;

  const stream = fs.createReadStream(entry.path, { start: startSize, end: stat.size });
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    if (line.trim().length > 0) {
      onLine(parseLine(entry.source, entry.processName, entry.stream, line));
    }
  });
}

function ensureWatch(
  filePath: string,
  source: LogLine["source"],
  processName: string,
  stream: "stdout" | "stderr",
  onLine: (line: LogLine) => void
) {
  if (watched.has(filePath)) return;

  let initialSize = 0;
  try {
    initialSize = fs.statSync(filePath).size; // skip pre-existing content on first sight
  } catch {
    return; // file doesn't exist (yet) — nothing to watch
  }

  const entry: WatchEntry = {
    path: filePath,
    size: initialSize,
    source,
    processName,
    stream,
    watcher: null,
    debounce: null,
  };

  try {
    entry.watcher = fs.watch(filePath, () => {
      // Coalesce bursts of writes (a busy app can fire many 'change' events
      // for one flush) into a single read a tick later.
      if (entry.debounce) clearTimeout(entry.debounce);
      entry.debounce = setTimeout(() => readNewBytes(entry, onLine), 80);
    });
  } catch {
    // inotify watch limits or permissions — fall back to periodic polling below.
  }

  watched.set(filePath, entry);
}

function discoverPm2LogFiles(onLine: (line: LogLine) => void) {
  pm2.list((err, list) => {
    if (err) return;
    for (const proc of list) {
      const env = (proc.pm2_env ?? {}) as Record<string, unknown>;
      const name = proc.name ?? "unknown";
      const outPath = env.pm_out_log_path as string | undefined;
      const errPath = env.pm_err_log_path as string | undefined;
      if (outPath) ensureWatch(outPath, "pm2", name, "stdout", onLine);
      if (errPath) ensureWatch(errPath, "pm2", name, "stderr", onLine);
    }
  });
}

const NGINX_LOG_CANDIDATES: Array<{ path: string; stream: "stdout" | "stderr" }> = [
  { path: "/var/log/nginx/access.log", stream: "stdout" },
  { path: "/var/log/nginx/error.log", stream: "stderr" },
];

function discoverNginxLogFiles(onLine: (line: LogLine) => void) {
  for (const { path, stream } of NGINX_LOG_CANDIDATES) {
    ensureWatch(path, "nginx", "nginx", stream, onLine);
  }
}

// Belt-and-braces poll in case inotify missed an event (rotation, NFS mounts,
// or watch limits) — the fs.watch handlers above are what makes this feel
// live; this is just a correctness backstop.
function pollAllWatched(onLine: (line: LogLine) => void) {
  for (const entry of watched.values()) readNewBytes(entry, onLine);
}

export function startLogTailing(onLine: (log: LogLine) => void, discoverIntervalMs = 5000) {
  const discover = () => {
    discoverPm2LogFiles(onLine);
    discoverNginxLogFiles(onLine);
  };
  discover();
  setInterval(discover, discoverIntervalMs);
  setInterval(() => pollAllWatched(onLine), 2000);
}
