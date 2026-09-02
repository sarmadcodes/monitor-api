"use client";

import { useRequireAuth } from "@/lib/useAuth";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
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
