import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

export interface AuditEntry {
  timestamp: number;
  user: string;
  action: string;
  serverId: string;
  serverName: string;
  processName: string | null;
  result: "success" | "failure";
  detail?: string;
}

const AUDIT_FILE = path.join(path.dirname(config.dataFile), "audit.log");
const MAX_IN_MEMORY = 500;
const recent: AuditEntry[] = [];

export function recordAudit(entry: AuditEntry) {
  recent.push(entry);
  if (recent.length > MAX_IN_MEMORY) recent.shift();

  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    // Never write secrets/tokens here — only the fields on AuditEntry, which
    // deliberately doesn't carry request bodies, cookies, or tokens.
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
  } catch {
    // best-effort — an audit write failure must not break the actual action
  }
}

export function listAudit(): AuditEntry[] {
  return [...recent].reverse();
}
