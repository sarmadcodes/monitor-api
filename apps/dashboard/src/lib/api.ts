export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      // Only declare a JSON body when we're actually sending one — setting
      // this on a bodyless POST (logout, rotate-token, acknowledge/resolve
      // incident) made the browser reject the request outright ("Body
      // cannot be empty when content-type is set to 'application/json'"),
      // which silently broke every one of those buttons: the thrown error
      // was never caught, so e.g. sign-out's router.replace("/login") after
      // it never ran and the button appeared to do nothing.
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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

export interface LoginResult {
  ok: boolean;
  username?: string;
  error?: string;
  challenge?: boolean;
  question?: string;
  blocked?: boolean;
}

export const api = {
  // Deliberately bypasses request()'s throw-on-!ok behavior: a failed login
  // still carries meaningful data (the taunt challenge, or the permanent-ban
  // message) that the login page needs to read, not just an error to swallow.
  login: async (username: string, password: string, nickname?: string): Promise<LoginResult> => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, nickname }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, ...body };
  },
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),
  listBlockedIps: () =>
    request<Array<{ ip: string; blockedAt: number; userAgent: string | null; nicknameGuess: string | null }>>(
      "/api/auth/blocked-ips"
    ),
  unblockIp: (ip: string) => request(`/api/auth/blocked-ips/${encodeURIComponent(ip)}/unblock`, { method: "POST" }),

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
  startService: (serverId: string, processName: string) =>
    request<{ ok: boolean; error?: string }>("/api/services/start", {
      method: "POST",
      body: JSON.stringify({ serverId, processName }),
    }),

  getGlobalLogs: () =>
    request<Array<import("@infra-monitor/shared").LogLine & { serverId: string; serverName: string }>>(
      "/api/logs"
    ),

  setPublicStatus: (id: string, enabled: boolean) =>
    request<{ id: string; isPublicStatusEnabled: boolean }>(`/api/servers/${id}/public-status`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  getPublicStatus: () => request<import("@infra-monitor/shared").PublicStatusResponse>("/api/public/status"),

  listIncidents: () => request<import("@infra-monitor/shared").Incident[]>("/api/incidents"),
  acknowledgeIncident: (id: string) =>
    request<import("@infra-monitor/shared").Incident>(`/api/incidents/${id}/acknowledge`, { method: "POST" }),
  resolveIncident: (id: string) =>
    request<import("@infra-monitor/shared").Incident>(`/api/incidents/${id}/resolve`, { method: "POST" }),
};
