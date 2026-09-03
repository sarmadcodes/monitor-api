"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Menu, X } from "lucide-react";
import clsx from "clsx";
import { useDashboardStore } from "@/lib/store";
import { api } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/services", label: "Services" },
  { href: "/logs", label: "Logs" },
  { href: "/incidents", label: "Incidents" },
  { href: "/wallboard", label: "Wallboard" },
  { href: "/settings/servers", label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const wsStatus = useDashboardStore((s) => s.wsStatus);
  const servers = useDashboardStore((s) => Object.values(s.servers));
  const openIncidents = useDashboardStore(
    (s) => Object.values(s.incidents).filter((i) => i.status !== "resolved").length
  );
  const [now, setNow] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close the drawer automatically whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const critical = servers.filter((s) => s.connectionStatus === "offline").length;
  const isRoot = pathname === "/";

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

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api.logout();
    } catch {
      // Even if the network call fails, the goal is to get the user off an
      // authenticated screen — a stale server-side cookie just means the
      // next protected request 401s and bounces them back to /login anyway.
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header
      className="sticky top-0 z-30 border-b border-bg-border bg-bg-panel/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center justify-between px-4 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-8">
          {/* Mobile back button — hidden on the root Overview page, where
              there's nowhere sensible to go back to. */}
          {!isRoot && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="-ml-2 flex h-11 w-11 items-center justify-center text-white md:hidden"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <Link href="/" className="mono text-sm font-semibold tracking-tight text-white">
            sarmad<span className="text-status-info">.tech</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  pathname === item.href ? "bg-bg-raised text-white" : "text-status-muted hover:text-white"
                )}
              >
                {item.label}
                {item.href === "/incidents" && openIncidents > 0 && (
                  <span className="ml-1.5 rounded-full bg-status-critical/20 px-1.5 py-0.5 text-[10px] text-status-critical">
                    {openIncidents}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* Desktop status strip */}
        <div className="mono hidden items-center gap-4 text-xs text-status-muted md:flex">
          <span>
            {servers.length} SERVERS ·{" "}
            {critical > 0 ? (
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
            onClick={signOut}
            disabled={signingOut}
            className="rounded-md border border-bg-border px-2 py-1 text-status-muted transition hover:text-white disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {/* Mobile: connection dot + hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              wsStatus === "connected" ? "bg-status-healthy live-dot" : "bg-status-warning"
            )}
            aria-label={statusLabel}
          />
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            className="flex h-11 w-11 items-center justify-center text-white"
          >
            {drawerOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <nav className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-bg-border bg-bg-panel md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex min-h-[48px] items-center justify-between border-b border-bg-border/60 px-5 text-[15px]",
                pathname === item.href ? "bg-bg-raised text-white" : "text-status-muted"
              )}
            >
              {item.label}
              {item.href === "/incidents" && openIncidents > 0 && (
                <span className="rounded-full bg-status-critical/20 px-1.5 py-0.5 text-[10px] text-status-critical">
                  {openIncidents}
                </span>
              )}
            </Link>
          ))}
          <div className="mono flex items-center justify-between px-5 py-3 text-xs text-status-muted">
            <span>
              {servers.length} servers · {critical > 0 ? `${critical} offline` : "all online"}
            </span>
            {now && <span>{now.toLocaleTimeString([], { hour12: false })}</span>}
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="flex min-h-[48px] w-full items-center px-5 text-[15px] text-status-critical disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      )}
    </header>
  );
}
