import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import type { SystemMetrics } from "@infra-monitor/shared";

const execFileAsync = promisify(execFile);

let prevCpuSample = os.cpus();
let prevNetSample: { rx: number; tx: number; at: number } | null = null;

function cpuUsagePercent(): number {
  const current = os.cpus();
  let idleDelta = 0;
  let totalDelta = 0;

  for (let i = 0; i < current.length; i++) {
    const prev = prevCpuSample[i]?.times;
    const cur = current[i].times;
    if (!prev) continue;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const curTotal = cur.user + cur.nice + cur.sys + cur.idle + cur.irq;
    totalDelta += curTotal - prevTotal;
    idleDelta += cur.idle - prev.idle;
  }

  prevCpuSample = current;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta)));
}

async function diskUsage(): Promise<{ total: number | null; used: number | null; percent: number | null }> {
  try {
    if (process.platform === "win32") {
      return { total: null, used: null, percent: null };
    }
    const { stdout } = await execFileAsync("df", ["-kP", "/"]);
    const lines = stdout.trim().split("\n");
    const cols = lines[1]?.split(/\s+/);
    if (!cols || cols.length < 5) return { total: null, used: null, percent: null };
    const totalKb = Number(cols[1]);
    const usedKb = Number(cols[2]);
    const percent = Number(cols[4].replace("%", ""));
    return { total: totalKb * 1024, used: usedKb * 1024, percent };
  } catch {
    return { total: null, used: null, percent: null };
  }
}

async function networkRates(): Promise<{ rxPerSec: number; txPerSec: number }> {
  try {
    const raw = await fs.readFile("/proc/net/dev", "utf-8");
    let rx = 0;
    let tx = 0;
    for (const line of raw.split("\n").slice(2)) {
      const [iface, rest] = line.split(":");
      if (!rest || iface.trim() === "lo") continue;
      const fields = rest.trim().split(/\s+/).map(Number);
      rx += fields[0] ?? 0;
      tx += fields[8] ?? 0;
    }
    const now = Date.now();
    if (!prevNetSample) {
      prevNetSample = { rx, tx, at: now };
      return { rxPerSec: 0, txPerSec: 0 };
    }
    const seconds = (now - prevNetSample.at) / 1000;
    const rxPerSec = seconds > 0 ? Math.max(0, (rx - prevNetSample.rx) / seconds) : 0;
    const txPerSec = seconds > 0 ? Math.max(0, (tx - prevNetSample.tx) / seconds) : 0;
    prevNetSample = { rx, tx, at: now };
    return { rxPerSec, txPerSec };
  } catch {
    return { rxPerSec: 0, txPerSec: 0 };
  }
}

async function pm2Version(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("pm2", ["--version"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

// Best-effort: most VPS/cloud instances (this box included) run virtualized
// with no exposed thermal zone, so null here is the honest, common case —
// not a bug. Real hardware with /sys/class/thermal will report a value.
async function readTemperatureC(): Promise<number | null> {
  if (process.platform !== "linux") return null;
  try {
    const zones = await fs.readdir("/sys/class/thermal");
    for (const zone of zones) {
      if (!zone.startsWith("thermal_zone")) continue;
      try {
        const raw = await fs.readFile(`/sys/class/thermal/${zone}/temp`, "utf-8");
        const milliC = Number(raw.trim());
        if (!Number.isNaN(milliC) && milliC > 0) return milliC / 1000;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const disk = await diskUsage();
  const net = await networkRates();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpuCount: os.cpus().length,
    cpuUsagePercent: cpuUsagePercent(),
    loadAvg: os.loadavg() as [number, number, number],
    memTotalBytes: totalMem,
    memUsedBytes: totalMem - freeMem,
    memFreeBytes: freeMem,
    diskTotalBytes: disk.total,
    diskUsedBytes: disk.used,
    diskPercent: disk.percent,
    netRxBytesPerSec: net.rxPerSec,
    netTxBytesPerSec: net.txPerSec,
    uptimeSeconds: os.uptime(),
    nodeVersion: process.version,
    pm2Version: await pm2Version(),
    temperatureC: await readTemperatureC(),
  };
}
