"use client";

import { useState } from "react";
import clsx from "clsx";
import { useDashboardStore } from "@/lib/store";
import { api } from "@/lib/api";
import { StatusDot } from "@/components/StatusDot";

export default function ServersSettingsPage() {
  const servers = useDashboardStore((s) => Object.values(s.servers));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ agentToken: string; installCommand: string; name: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const result = await api.createServer({ name, description, environment });
      setCreated({ agentToken: result.agentToken, installCommand: result.installCommand, name: result.name });
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this server? The agent will be disconnected and its data cleared.")) return;
    setBusyId(id);
    try {
      await api.deleteServer(id);
      useDashboardStore.getState().removeServer(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove server");
    } finally {
      setBusyId(null);
    }
  }

  async function onRotate(id: string) {
    if (!confirm("Rotate this server's agent token? The currently installed agent will stop authenticating.")) return;
    setBusyId(id);
    try {
      const result = await api.rotateToken(id);
      alert(`New token: ${result.agentToken}\n\nUpdate the agent's .env (AGENT_TOKEN) and restart it.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rotate token");
    } finally {
      setBusyId(null);
    }
  }

  async function onTogglePublic(id: string, enabled: boolean) {
    setBusyId(id);
    try {
      await api.setPublicStatus(id, enabled);
      const server = useDashboardStore.getState().servers[id];
      if (server) useDashboardStore.getState().upsertServer({ ...server, isPublicStatusEnabled: enabled });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update public status");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-lg font-semibold text-white">Servers</h1>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <form onSubmit={onCreate} className="rounded-lg border border-bg-border bg-bg-panel p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Add Server</h2>
          <label className="mb-1 block text-xs uppercase tracking-wide text-status-muted">Server Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production VPS"
            className="mb-3 w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 text-sm text-white outline-none focus:border-status-info"
          />
          <label className="mb-1 block text-xs uppercase tracking-wide text-status-muted">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="CloudPanel VPS — srv1687902"
            className="mb-3 w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 text-sm text-white outline-none focus:border-status-info"
          />
          <label className="mb-1 block text-xs uppercase tracking-wide text-status-muted">Environment</label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="mb-4 w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 text-sm text-white outline-none focus:border-status-info"
          >
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="development">development</option>
          </select>
          {error && <p className="mb-3 text-sm text-status-critical">{error}</p>}
          <button
            disabled={creating}
            className="min-h-[44px] w-full rounded-md bg-status-info px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 sm:w-auto"
          >
            {creating ? "Creating…" : "Generate Agent Token"}
          </button>
        </form>

        {created && (
          <div className="rounded-lg border border-status-info/40 bg-bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">{created.name} — Install the agent</h2>
            <p className="mb-2 text-xs text-status-muted">Agent Token (save this, shown once):</p>
            <pre className="mono mb-3 overflow-x-auto rounded-md bg-bg-raised p-3 text-xs text-status-warning">
              {created.agentToken}
            </pre>
            <p className="mb-2 text-xs text-status-muted">Run on the target VPS as root:</p>
            <pre className="mono overflow-x-auto rounded-md bg-bg-raised p-3 text-xs text-status-healthy">
              {created.installCommand}
            </pre>
            <p className="mt-3 text-xs text-status-muted">
              If PM2 apps on that box run under root (check with <code className="mono">pm2 list</code> as root vs
              your site user), add <code className="mono">RUN_AS_ROOT=1</code> to the command above so the agent can
              see them.
            </p>
          </div>
        )}
      </div>

      {/* Mobile: one card per server. */}
      <div className="divide-y divide-bg-border rounded-lg border border-bg-border bg-bg-panel md:hidden">
        {servers.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-white">
                <StatusDot color={s.connectionStatus === "online" ? "healthy" : "critical"} />
                {s.name}
              </span>
              <span className="text-xs text-status-muted">{s.environment}</span>
            </div>
            <p className="mono mb-2 text-xs text-status-muted">{s.processes.length} services</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onTogglePublic(s.id, !s.isPublicStatusEnabled)}
                disabled={busyId === s.id}
                className={clsx(
                  "min-h-[36px] rounded-md border px-3 text-xs disabled:opacity-50",
                  s.isPublicStatusEnabled
                    ? "border-status-healthy/40 text-status-healthy"
                    : "border-bg-border text-status-muted"
                )}
              >
                {s.isPublicStatusEnabled ? "Shown on /status" : "Hidden from /status"}
              </button>
              <button
                onClick={() => onRotate(s.id)}
                disabled={busyId === s.id}
                className="min-h-[36px] rounded-md border border-bg-border px-3 text-xs text-status-muted disabled:opacity-50"
              >
                Rotate token
              </button>
              <button
                onClick={() => onDelete(s.id)}
                disabled={busyId === s.id}
                className="min-h-[36px] rounded-md border border-bg-border px-3 text-xs text-status-critical disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {servers.length === 0 && <p className="px-4 py-8 text-center text-sm text-status-muted">No servers yet.</p>}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-bg-border bg-bg-panel md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-bg-border text-[11px] uppercase tracking-wide text-status-muted">
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Environment</th>
              <th className="px-4 py-2.5">Services</th>
              <th className="px-4 py-2.5">Public status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id} className="border-b border-bg-border/60">
                <td className="px-4 py-2.5">
                  <StatusDot color={s.connectionStatus === "online" ? "healthy" : "critical"} />
                </td>
                <td className="px-4 py-2.5 font-medium text-white">{s.name}</td>
                <td className="px-4 py-2.5 text-status-muted">{s.environment}</td>
                <td className="mono px-4 py-2.5">{s.processes.length}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => onTogglePublic(s.id, !s.isPublicStatusEnabled)}
                    disabled={busyId === s.id}
                    className={clsx(
                      "rounded-md border px-2 py-1 text-xs disabled:opacity-50",
                      s.isPublicStatusEnabled
                        ? "border-status-healthy/40 text-status-healthy"
                        : "border-bg-border text-status-muted hover:text-white"
                    )}
                  >
                    {s.isPublicStatusEnabled ? "Shown on /status" : "Hidden from /status"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => onRotate(s.id)}
                    disabled={busyId === s.id}
                    className="mr-2 rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white disabled:opacity-50"
                  >
                    Rotate token
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    disabled={busyId === s.id}
                    className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-status-muted">
                  No servers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
