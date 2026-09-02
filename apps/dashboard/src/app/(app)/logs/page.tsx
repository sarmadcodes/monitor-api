"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogViewer } from "@/components/LogViewer";
import { useDashboardStore, type GlobalLogEntry } from "@/lib/store";
import { api } from "@/lib/api";

export default function GlobalLogsPage() {
  const router = useRouter();
  const liveLog = useDashboardStore((s) => s.globalLog);
  const [historical, setHistorical] = useState<GlobalLogEntry[]>([]);

  useEffect(() => {
    api.getGlobalLogs().then(setHistorical).catch(() => {});
  }, []);

  const combined = useMemo(() => {
    const merged = [...historical, ...liveLog];
    const seen = new Set<string>();
    return merged.filter((l) => {
      const k = `${l.serverId}:${l.timestamp}:${l.raw}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [historical, liveLog]);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-white">Live Logs</h1>
        <p className="text-sm text-status-muted">Aggregated in real time across every connected server and service.</p>
      </div>
      <LogViewer
        logs={combined}
        showServer
        height={640}
        onLineClick={(l) => {
          const entry = l as GlobalLogEntry;
          if (entry.processName && entry.serverId) {
            router.push(`/services/${entry.serverId}/${encodeURIComponent(entry.processName)}`);
          }
        }}
      />
    </>
  );
}
