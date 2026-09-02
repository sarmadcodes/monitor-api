"use client";

import { useRequireAuth } from "@/lib/useAuth";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { TopBar } from "@/components/TopBar";

// This layout wraps every authenticated page (/, /services, /logs,
// /incidents, /settings) except /wallboard and /login. Next.js keeps a
// shared layout mounted across client-side navigation between its child
// routes, so the auth check and the WebSocket connection below are made
// ONCE per session, not re-opened on every click — that's the whole reason
// this lives in a route-group layout instead of being repeated per page.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const status = useRequireAuth();
  useLiveConnection(status === "authed");

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-status-muted">
        <span className="mono text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-5 py-6">{children}</main>
    </div>
  );
}
