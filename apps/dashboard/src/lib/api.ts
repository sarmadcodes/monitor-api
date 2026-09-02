export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let error = res.statusText;
    try {
      const body = await res.json();
      error = body.error ?? error;
    } catch {
      // ignore
    }
    throw new Error(error);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ ok: true; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),

  listServers: () => request<import("@infra-monitor/shared").ServerSnapshot[]>("/api/servers"),
  getServer: (id: string) => request<import("@infra-monitor/shared").ServerSnapshot>(`/api/servers/${id}`),
  getLogs: (id: string, processName?: string) =>
    request<import("@infra-monitor/shared").LogLine[]>(
      `/api/servers/${id}/logs${processName ? `?process=${encodeURIComponent(processName)}` : ""}`
    ),
  createServer: (input: { name: string; description: string; environment: string }) =>
    request<{
      id: string;
      name: string;
      agentToken: string;
      apiUrl: string;
      installCommand: string;
    }>("/api/servers", { method: "POST", body: JSON.stringify(input) }),
  deleteServer: (id: string) => request(`/api/servers/${id}`, { method: "DELETE" }),
  rotateToken: (id: string) =>
    request<{ agentToken: string }>(`/api/servers/${id}/rotate-token`, { method: "POST" }),
  setHealthUrl: (id: string, processName: string, url: string | null) =>
    request(`/api/servers/${id}/health-url`, {
      method: "POST",
      body: JSON.stringify({ processName, url }),
    }),

  restartService: (serverId: string, processName: string) =>
    request<{ ok: boolean; error?: string }>("/api/services/restart", {
      method: "POST",
      body: JSON.stringify({ serverId, processName }),
    }),
  reloadService: (serverId: string, processName: string) =>
    request<{ ok: boolean; error?: string }>("/api/services/reload", {
      method: "POST",
      body: JSON.stringify({ serverId, processName }),
    }),
  stopService: (serverId: string, processName: string) =>
    request<{ ok: boolean; error?: string }>("/api/services/stop", {
      method: "POST",
      body: JSON.stringify({ serverId, processName }),
    }),
};
