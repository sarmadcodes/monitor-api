import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NginxStatus } from "@infra-monitor/shared";

const execFileAsync = promisify(execFile);

export async function checkNginxStatus(): Promise<NginxStatus> {
  let version: string | null = null;
  let installed = false;
  try {
    const { stderr, stdout } = await execFileAsync("nginx", ["-v"]);
    const out = (stderr || stdout).trim();
    const match = out.match(/nginx\/([\d.]+)/);
    version = match ? match[1] : out || null;
    installed = true;
  } catch {
    return { installed: false, active: false, version: null };
  }

  let active = false;
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", "nginx"]);
    active = stdout.trim() === "active";
  } catch {
    active = false;
  }

  return { installed, active, version };
}
