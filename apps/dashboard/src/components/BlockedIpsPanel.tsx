"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

interface BlockedIp {
  ip: string;
  blockedAt: number;
  userAgent: string | null;
  nicknameGuess: string | null;
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
        Permanently blocked from logging in or connecting to the live dashboard after repeated failed attempts.
        The public status page still loads for them.
      </p>
      {blocked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-bg-border p-6 text-center text-sm text-status-muted">
          Nobody's been blocked yet.
        </p>
      ) : (
        <div className="divide-y divide-bg-border rounded-lg border border-bg-border bg-bg-panel">
          {blocked.map((b) => (
            <div key={b.ip} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mono text-sm font-medium text-white">{b.ip}</p>
                <p className="text-xs text-status-muted">
                  Blocked {formatRelativeTime(b.blockedAt)}
                  {b.nicknameGuess && (
                    <>
                      {" "}
                      · guessed &quot;<span className="text-status-warning">{b.nicknameGuess}</span>&quot;
                    </>
                  )}
                </p>
                {b.userAgent && <p className="mt-0.5 truncate text-[11px] text-status-muted">{b.userAgent}</p>}
              </div>
              <button
                onClick={() => unblock(b.ip)}
                disabled={busyIp === b.ip}
                className="min-h-[36px] shrink-0 rounded-md border border-bg-border px-3 text-xs text-status-muted hover:text-white disabled:opacity-50"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
