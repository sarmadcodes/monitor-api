# sarmad.tech — Infrastructure Monitor (Phase 1)

Real-time monitoring dashboard for your VPS fleet: server health, PM2 process
discovery, live logs, HTTP health checks, and restart/reload/stop actions —
all pushed to the browser over WebSocket, no polling, no page refresh.

This is **Phase 1** of the full spec: auth, server registration, one agent,
CPU/RAM/disk/network, PM2 discovery, live status, live logs, health checks,
and restart/reload/stop. Historical metrics (Postgres), incidents, alerts,
SSL/Nginx monitoring, and deployment tracking are Phase 2/3 — the WebSocket
protocol and data model in `packages/shared` were designed so those can be
added without rewriting this layer.

## Architecture

```
apps/dashboard      Next.js + TS + Tailwind. Talks to the API over REST (auth,
                     server CRUD, actions) and one WebSocket (/ws) for live
                     server/service/log updates.

apps/monitoring-api  Fastify + TS. Two WebSocket endpoints:
                       /agent  — agents connect outbound, authenticate with a
                                 per-server token, stream metrics/processes/logs.
                       /ws     — dashboard clients, authenticated via session
                                 cookie, receive broadcasts.
                     In-memory live state + a small JSON file (data/servers.json)
                     persisting registered servers and their agent tokens.
                     Runs its own HTTP health checks against configured URLs.

apps/agent           Runs on each VPS. Connects OUTBOUND to the API over WS —
                     the VPS needs no open inbound port. Collects system
                     metrics (os module + /proc/net/dev + df), PM2 process
                     info (pm2 npm package's programmatic API — no output
                     scraping), tails PM2 log files for new lines, and
                     executes restart/reload/stop through an explicit
                     allowlist (never arbitrary shell commands).

packages/shared      Shared TypeScript types for the two WebSocket protocols.
```

Why this shape: the dashboard never talks to your servers directly (no
SSH-from-browser), and each VPS only needs outbound network access.

## Local development

```bash
npm install
cp apps/monitoring-api/.env.example apps/monitoring-api/.env   # set ADMIN_PASSWORD, JWT_SECRET
cp apps/dashboard/.env.example apps/dashboard/.env
npm run dev:api          # http://localhost:4000
npm run dev:dashboard    # http://localhost:3000
```

To run an agent locally against it:

```bash
cp apps/agent/.env.example apps/agent/.env   # fill in AGENT_TOKEN from the dashboard
npm run dev:agent
```

## Adding a server

1. Sign in to the dashboard, go to **Settings → Servers → Add Server**.
2. Copy the generated agent token and install command.
3. On the target VPS, as root:

```bash
AGENT_TOKEN=<token> API_URL=http://your-monitor-host:4000 bash install-agent.sh
```

**Important — CloudPanel / root-managed PM2:** PM2's daemon is per-user. If
your Node apps were started as `root` (common on CloudPanel boxes set up the
way `whatson-api` was — check with `pm2 list` as root vs.
`su - <siteuser> -c "pm2 list"`), the agent must run as root too, or it will
see an empty process list. Pass `RUN_AS_ROOT=1` to the installer in that case.
This is a real tradeoff against running the agent unprivileged — documented
rather than hidden.

The install script is idempotent (safe to re-run), creates a systemd service
(`infra-monitor-agent`), and restarts on failure.

## Rotating an agent token

Settings → Servers → **Rotate token**, then update `AGENT_TOKEN` in the
agent's `.env` on that VPS and `systemctl restart infra-monitor-agent`.

## Restarting / reloading / stopping a service

Open the service detail page (`/services/<serverId>/<processName>`) and use
the action buttons — each requires an explicit confirmation dialog. The
dashboard never sends a raw shell command: it sends `restart`/`reload`/`stop`
with a process name, the API forwards it to that server's agent, and the
agent validates the process name against its own `pm2 jlist` output before
touching PM2.

## Wallboard

`/wallboard` is built for a secondary monitor left on for hours — big
glanceable tiles, a services list, and recent warnings/errors, with a
fullscreen button and no required interaction.

## Security notes (Phase 1)

- Single admin user via `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars, session
  is a signed JWT in an httpOnly cookie.
- Agent tokens are random 32-char ids, generated server-side, never sent to
  the browser after initial display.
- PM2 actions go through an explicit allowlist (`restart`/`reload`/`stop`)
  validated against real process names on the agent — there is no generic
  command-execution endpoint.
- Nothing in `apps/agent` or `apps/monitoring-api` requires database
  credentials, SMTP passwords, or Cloudinary secrets from your applications —
  the monitor only needs process names and optional public health-check URLs.
- **Rotate the secrets that were pasted into this session's terminal output**
  (MongoDB password, Gmail app password, Cloudinary secret, JWT_SECRET for
  whatson-api) — they are not used by anything in this repo, but they were
  exposed in plaintext and should be treated as compromised.

## What's not built yet (by design — see Phase 2/3 in the spec)

PostgreSQL historical metrics/charts, incidents, alert rules, notifications,
SSL/Nginx monitoring, GitHub deployment tracking. `packages/shared` and the
WebSocket event set already include placeholders (`incident:*`,
`deployment:*` in the original spec) so these slot in without a rewrite.
