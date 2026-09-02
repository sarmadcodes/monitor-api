"use client";

import Link from "next/link";
import { ServerCard } from "@/components/ServerCard";
import { ServiceTable } from "@/components/ServiceTable";
import { IncidentBanner } from "@/components/IncidentBanner";
import { useDashboardStore } from "@/lib/store";

export default function OverviewPage() {
  const servers = useDashboardStore((s) => Object.values(s.servers));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">System Health</h1>
      </div>

      <IncidentBanner />

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-bg-border p-10 text-center">
          <p className="mb-3 text-status-muted">No servers registered yet.</p>
          <Link
            href="/settings/servers"
            className="inline-block rounded-md bg-status-info px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Add your first server
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-status-muted">Services</h2>
          <ServiceTable servers={servers} />
        </>
      )}
    </>
  );
}
