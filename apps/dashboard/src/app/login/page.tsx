"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type Stage = "credentials" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(username, password);
      if (result.blocked) {
        setBlocked(true);
        return;
      }
      if (result.ok && result.otpRequired && result.tempToken) {
        setTempToken(result.tempToken);
        setStage("otp");
        return;
      }
      if (result.ok) {
        // otpSkipped case — SMTP isn't configured, session was issued directly.
        router.replace("/");
        return;
      }
      setError(result.error ?? "Login failed");
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.verifyOtp(tempToken, code);
      if (result.blocked) {
        setBlocked(true);
        return;
      }
      if (result.ok) {
        router.replace("/");
        return;
      }
      setError(result.error ?? "Incorrect code");
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-info/[0.06] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mono text-2xl font-bold tracking-[0.1em] text-white">
            SARMADS<span className="text-status-info">.TECH</span>
          </h1>
          <p className="mono mt-2 text-[11px] uppercase tracking-[0.25em] text-status-muted">
            Infrastructure Command Center
          </p>
        </div>

        {blocked ? (
          <div className="rounded-lg border border-status-critical/40 bg-bg-panel/90 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur">
            <p className="mono text-lg font-bold text-status-critical">sarmad has blocked u congrats</p>
            <p className="mt-2 text-sm text-status-muted">Nice try. This is going nowhere from here.</p>
          </div>
        ) : stage === "credentials" ? (
          <form
            onSubmit={onSubmitCredentials}
            noValidate
            className="rounded-lg border border-bg-border bg-bg-panel/90 p-6 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
          >
            <div className="mb-4">
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-status-muted">
                Username
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                className="w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 text-sm text-white outline-none transition focus:border-status-info focus:ring-1 focus:ring-status-info"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-status-muted">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 pr-10 text-sm text-white outline-none transition focus:border-status-info focus:ring-1 focus:ring-status-info"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-status-muted transition hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-status-info"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="mb-4 rounded-md border border-status-critical/30 bg-status-critical/[0.08] px-3 py-2 text-sm text-status-critical">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-status-info px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={onSubmitOtp}
            noValidate
            className="rounded-lg border border-bg-border bg-bg-panel/90 p-6 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
          >
            <p className="mb-4 text-sm text-status-muted">
              We emailed a 6-digit code to your inbox. Enter it below — it expires in 5 minutes.
            </p>
            <div className="mb-5">
              <label htmlFor="code" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-status-muted">
                Verification code
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                className="mono w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2.5 text-center text-lg tracking-[0.3em] text-white outline-none transition focus:border-status-info focus:ring-1 focus:ring-status-info"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>

            {error && (
              <p role="alert" className="mb-4 rounded-md border border-status-critical/30 bg-status-critical/[0.08] px-3 py-2 text-sm text-status-critical">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-status-info px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("credentials");
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-xs text-status-muted hover:text-white"
            >
              ← Back to login
            </button>
          </form>
        )}

        {!blocked && (
          <p className="mono mt-6 text-center text-[11px] text-status-muted">
            <a href="/status" className="hover:text-white hover:underline">
              View public status page →
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
