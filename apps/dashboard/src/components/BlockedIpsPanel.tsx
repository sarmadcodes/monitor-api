"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

interface AttemptRecord {
  attemptNumber: number;
  username: string;
  password: string;
  timestamp: number;
}

interface BlockedIp {
  ip: string;
  blockedAt: number;
  userAgent: string | null;
  attempts: AttemptRecord[];
}

export function BlockedIpsPanel() {
  const [blocked, setBlocked] = useState<BlockedIp[] | null>(null);
  const [busyIp, setBusyIp] = useState<string | null>(null);

  function load() {
    api.listBlockedIps().then(setBlocked).catch(() => setBlocked([]));
  }

  useEffect(load, []);

  async function unblock(ip: string) {
    setBusyIp(ip);
    try {
      await api.unblockIp(ip);
      load();
    } finally {
      setBusyIp(null);
    }
  }

  if (blocked === null) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-status-muted">
        Blocked IPs ({blocked.length})
      </h2>
      <p className="mb-3 text-xs text-status-muted">
        Permanently blocked from logging in or connecting to the live dashboard after 3 failed attempts. The
        public status page still loads for them. Each attempt&apos;s username/password was emailed to you.
      </p>
      {blocked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-bg-border p-6 text-center text-sm text-status-muted">
          Nobody's been blocked yet.
        </p>
      ) : (
        <div className="divide-y divide-bg-border rounded-lg border border-bg-border bg-bg-panel">
          {blocked.map((b) => (
            <div key={b.ip} className="p-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="mono text-sm font-medium text-white">{b.ip}</p>
                  <p className="text-xs text-status-muted">Blocked {formatRelativeTime(b.blockedAt)}</p>
                  {b.userAgent && <p className="mt-0.5 truncate text-[11px] text-status-muted">{b.userAgent}</p>}
                </div>
                <button
                  onClick={() => unblock(b.ip)}
                  disabled={busyIp === b.ip}
                  className="min-h-[36px] shrink-0 self-start rounded-md border border-bg-border px-3 text-xs text-status-muted hover:text-white disabled:opacity-50 sm:self-auto"
                >
                  Unblock
                </button>
              </div>
              <div className="mono space-y-1 rounded-md bg-bg-raised p-2.5 text-xs">
                {b.attempts.map((a) => (
                  <div key={a.attemptNumber} className="flex flex-wrap gap-x-3 text-status-muted">
                    <span className="text-status-warning">#{a.attemptNumber}</span>
                    <span>
                      user=<span className="text-white">{a.username}</span>
                    </span>
                    <span>
                      pass=<span className="text-white">{a.password}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
