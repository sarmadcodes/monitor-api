import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { sendAlertEmail } from "./email";

export const BLOCK_MESSAGE = "sarmad has blocked u congrats";
const BLOCK_AFTER_FAILURES = 3; // block permanently on the 3rd wrong attempt

interface AttemptRecord {
  attemptNumber: number;
  username: string;
  password: string;
  timestamp: number;
}

interface BlockedEntry {
  ip: string;
  blockedAt: number;
  userAgent: string | null;
  attempts: AttemptRecord[];
}

interface PersistedBlocklist {
  blocked: BlockedEntry[];
}

function loadBlocklist(): PersistedBlocklist {
  try {
    return JSON.parse(fs.readFileSync(config.blockedIpsFile, "utf-8"));
  } catch {
    return { blocked: [] };
  }
}

function saveBlocklist(data: PersistedBlocklist) {
  const dir = path.dirname(config.blockedIpsFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.blockedIpsFile, JSON.stringify(data, null, 2));
}

const blocked = new Map<string, BlockedEntry>();
for (const entry of loadBlocklist().blocked) {
  blocked.set(entry.ip, entry);
}

// Per-IP attempt history is in-memory only until (if) the IP gets blocked,
// at which point the whole history is persisted alongside the block.
const attemptsByIp = new Map<string, AttemptRecord[]>();

export function isBlocked(ip: string): boolean {
  return blocked.has(ip);
}

export function listBlocked(): BlockedEntry[] {
  return Array.from(blocked.values()).sort((a, b) => b.blockedAt - a.blockedAt);
}

export function unblock(ip: string) {
  blocked.delete(ip);
  attemptsByIp.delete(ip);
  saveBlocklist({ blocked: listBlocked() });
}

export interface LoginFailureOutcome {
  action: "reject" | "block";
}

/**
 * Call once per failed login attempt for this IP. Emails the attempted
 * username/password every time (that's the whole point — a wrong password
 * from someone who isn't you is intel, not a secret worth protecting), and
 * blocks the IP outright once BLOCK_AFTER_FAILURES is reached.
 */
export async function recordFailedLogin(
  ip: string,
  userAgent: string | null,
  username: string,
  password: string
): Promise<LoginFailureOutcome> {
  const history = attemptsByIp.get(ip) ?? [];
  const attempt: AttemptRecord = { attemptNumber: history.length + 1, username, password, timestamp: Date.now() };
  history.push(attempt);
  attemptsByIp.set(ip, history);

  if (attempt.attemptNumber >= BLOCK_AFTER_FAILURES) {
    const entry: BlockedEntry = { ip, blockedAt: Date.now(), userAgent, attempts: history };
    blocked.set(ip, entry);
    saveBlocklist({ blocked: listBlocked() });
    await sendAlertEmail(
      `Login attempt #${attempt.attemptNumber} — IP blocked`,
      [
        `IP ${ip} just failed to log in for the ${ordinal(attempt.attemptNumber)} time and has been permanently blocked.`,
        `Username tried: ${username}`,
        `Password tried: ${password}`,
        `User agent: ${userAgent ?? "unknown"}`,
        `Time: ${new Date(attempt.timestamp).toISOString()}`,
        "",
        "Full attempt history from this IP:",
        ...history.map((a) => `  #${a.attemptNumber}: username="${a.username}" password="${a.password}"`),
      ].join("\n")
    );
    return { action: "block" };
  }

  await sendAlertEmail(
    `Login attempt #${attempt.attemptNumber} failed`,
    [
      `IP ${ip} failed to log in (attempt ${attempt.attemptNumber} of ${BLOCK_AFTER_FAILURES} before blocking).`,
      `Username tried: ${username}`,
      `Password tried: ${password}`,
      `User agent: ${userAgent ?? "unknown"}`,
      `Time: ${new Date(attempt.timestamp).toISOString()}`,
    ].join("\n")
  );
  return { action: "reject" };
}

export function resetFailures(ip: string) {
  attemptsByIp.delete(ip);
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}
