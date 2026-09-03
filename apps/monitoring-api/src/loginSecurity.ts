import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { sendAlertEmail } from "./email";

export const BLOCK_MESSAGE = "sarmad has blocked u congrats";
const CHALLENGE_QUESTION = "Quick — what's Sarmad's nickname?";
const CHALLENGE_AFTER_FAILURES = 2; // show the taunt on the 2nd wrong attempt
const BLOCK_AFTER_FAILURES = 3; // block permanently on the 3rd

interface BlockedEntry {
  ip: string;
  blockedAt: number;
  userAgent: string | null;
  nicknameGuess: string | null;
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

// Failed-attempt counters are intentionally in-memory only (reset on
// restart) — only the permanent block itself needs to survive a redeploy.
const failures = new Map<string, number>();

export function isBlocked(ip: string): boolean {
  return blocked.has(ip);
}

export function listBlocked(): BlockedEntry[] {
  return Array.from(blocked.values()).sort((a, b) => b.blockedAt - a.blockedAt);
}

export function unblock(ip: string) {
  blocked.delete(ip);
  failures.delete(ip);
  saveBlocklist({ blocked: listBlocked() });
}

export interface LoginFailureOutcome {
  action: "reject" | "challenge" | "block";
}

/**
 * Call once per failed login attempt for this IP. Returns what the login
 * route should do next: a plain rejection, show the taunt challenge, or
 * block the IP outright (this call also performs the block + email).
 */
export async function recordFailedLogin(
  ip: string,
  userAgent: string | null,
  nicknameGuess: string | null
): Promise<LoginFailureOutcome> {
  const count = (failures.get(ip) ?? 0) + 1;
  failures.set(ip, count);

  if (count >= BLOCK_AFTER_FAILURES) {
    const entry: BlockedEntry = { ip, blockedAt: Date.now(), userAgent, nicknameGuess };
    blocked.set(ip, entry);
    saveBlocklist({ blocked: listBlocked() });
    await sendAlertEmail(
      "IP blocked after repeated failed logins",
      [
        `IP ${ip} was permanently blocked from sarmads.tech after ${count} failed login attempts.`,
        `Their "nickname" guess: ${nicknameGuess || "(left blank)"}`,
        `User agent: ${userAgent ?? "unknown"}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n")
    );
    return { action: "block" };
  }

  if (count >= CHALLENGE_AFTER_FAILURES) {
    await sendAlertEmail(
      "Repeated failed login attempt",
      [
        `IP ${ip} has failed to log in ${count} times and is now seeing the challenge prompt.`,
        `User agent: ${userAgent ?? "unknown"}`,
        `Time: ${new Date().toISOString()}`,
      ].join("\n")
    );
    return { action: "challenge" };
  }

  return { action: "reject" };
}

export function resetFailures(ip: string) {
  failures.delete(ip);
}

export function getChallengeQuestion() {
  return CHALLENGE_QUESTION;
}
