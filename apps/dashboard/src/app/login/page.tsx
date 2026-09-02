"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(username, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mono text-xl font-semibold tracking-tight text-white">sarmad.tech</h1>
          <p className="mt-1 text-sm text-status-muted">Infrastructure Command Center</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-bg-border bg-bg-panel p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
        >
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-status-muted">
            Username
          </label>
          <input
            className="mb-4 w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2 text-sm text-white outline-none focus:border-status-info"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-status-muted">
            Password
          </label>
          <input
            type="password"
            className="mb-5 w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2 text-sm text-white outline-none focus:border-status-info"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="mb-4 text-sm text-status.critical text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-status-info px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
