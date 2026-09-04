import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { sendAlertEmail } from "./email";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

interface PendingOtp {
  code: string;
  username: string;
  expiresAt: number;
  attempts: number;
}

const pending = new Map<string, PendingOtp>(); // tempToken -> pending OTP

function generateCode(): string {
  // crypto.randomInt is cryptographically strong — this gates the only
  // remaining step before a session is issued, so it shouldn't be
  // predictable the way Math.random() can be.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createOtpChallenge(username: string): { tempToken: string; code: string } {
  const tempToken = nanoid(32);
  const code = generateCode();
  pending.set(tempToken, { code, username, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return { tempToken, code };
}

export type OtpVerifyResult =
  | { ok: true; username: string }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "wrong_code" };

export function verifyOtp(tempToken: string, code: string): OtpVerifyResult {
  const entry = pending.get(tempToken);
  if (!entry) return { ok: false, reason: "not_found" };

  if (Date.now() > entry.expiresAt) {
    pending.delete(tempToken);
    return { ok: false, reason: "expired" };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_OTP_ATTEMPTS) {
    pending.delete(tempToken);
    return { ok: false, reason: "too_many_attempts" };
  }

  // Constant-time comparison so response timing can't leak how many digits
  // matched — a 6-digit code is a small enough space that this matters.
  const a = Buffer.from(entry.code);
  const b = Buffer.from(code.padStart(6, "0").slice(0, 6));
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!matches) {
    return { ok: false, reason: "wrong_code" };
  }

  pending.delete(tempToken);
  return { ok: true, username: entry.username };
}

export async function sendOtpEmail(username: string, code: string) {
  await sendAlertEmail(
    "Your sign-in code",
    [
      `Someone (hopefully you) entered the correct password for "${username}" and needs this code to finish signing in:`,
      "",
      `  ${code}`,
      "",
      `Expires in 5 minutes. If this wasn't you, your password is compromised — change it immediately.`,
    ].join("\n")
  );
}

// Periodic cleanup so long-running processes don't accumulate expired
// entries forever.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (now > entry.expiresAt) pending.delete(token);
  }
}, 60_000).unref();
