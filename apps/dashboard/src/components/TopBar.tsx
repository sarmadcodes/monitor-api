"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useDashboardStore } from "@/lib/store";
import { api } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/services", label: "Services" },
  { href: "/wallboard", label: "Wallboard" },
  { href: "/settings/servers", label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const wsStatus = useDashboardStore((s) => s.wsStatus);
  const servers = useDashboardStore((s) => Object.values(s.servers));
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const critical = servers.filter((s) => s.connectionStatus === "offline").length;

  const statusColor = {
    connected: "text-status-healthy",
    connecting: "text-status-warning",
    reconnecting: "text-status-warning",
    disconnected: "text-status-critical",
  }[wsStatus];

  const statusLabel = {
    connected: "LIVE",
    connecting: "CONNECTING",
    reconnecting: "RECONNECTING",
    disconnected: "DISCONNECTED",
  }[wsStatus];

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-bg-border bg-bg-panel/95 px-5 backdrop-blur">
      <div className="flex items-center gap-8">
        <Link href="/" className="mono text-sm font-semibold tracking-tight text-white">
          sarmad<span className="text-status-info">.tech</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm transition",
                pathname === item.href
                  ? "bg-bg-raised text-white"
                  : "text-status-muted hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mono flex items-center gap-4 text-xs text-status-muted">
        <span>
          {servers.length} SERVERS · {critical > 0 ? (
            <span className="text-status-critical">{critical} OFFLINE</span>
          ) : (
            <span className="text-status-healthy">ALL ONLINE</span>
          )}
        </span>
        <span className={clsx("flex items-center gap-1.5 font-medium", statusColor)}>
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              wsStatus === "connected" ? "bg-status-healthy live-dot" : "bg-current"
            )}
          />
          {statusLabel}
        </span>
        {now && <span>{now.toLocaleTimeString([], { hour12: false })}</span>}
        <button
          onClick={async () => {
            await api.logout();
            router.replace("/login");
          }}
          className="rounded-md border border-bg-border px-2 py-1 text-status-muted transition hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
