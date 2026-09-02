interface Pending {
  resolve: (result: { ok: boolean; error?: string }) => void;
  timeout: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();

export function waitForAction(requestId: string, timeoutMs = 15000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: "Timed out waiting for agent response" });
    }, timeoutMs);
    pending.set(requestId, { resolve, timeout });
  });
}

export function resolveAction(requestId: string, ok: boolean, error?: string) {
  const p = pending.get(requestId);
  if (!p) return;
  clearTimeout(p.timeout);
  pending.delete(requestId);
  p.resolve({ ok, error });
}
