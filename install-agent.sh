#!/usr/bin/env bash
# Installs the infra-monitor server agent as a systemd service.
# Usage: AGENT_TOKEN=xxx API_URL=http://monitor-api.example.com:4000 bash install-agent.sh
#
# Idempotent: safe to re-run (updates config + restarts the service).
set -euo pipefail

AGENT_TOKEN="${AGENT_TOKEN:-}"
API_URL="${API_URL:-http://localhost:4000}"
REPO_URL="${REPO_URL:-https://github.com/YOUR_GITHUB/infra-monitor.git}"
INSTALL_DIR="/opt/infra-monitor-agent"
# PM2_HOME of the account whose PM2 daemon manages your apps. On a CloudPanel
# box where apps were started as root (check: `pm2 list` as root shows them
# vs `su - <siteuser> -c "pm2 list"` shows nothing), this must be /root/.pm2
# and the agent then has to run as root — PM2's daemon is per-user and does
# not expose other users' process lists. Only set RUN_AS_ROOT=1 in that case.
PM2_HOME="${PM2_HOME:-$HOME/.pm2}"
RUN_AS_ROOT="${RUN_AS_ROOT:-0}"
SERVICE_USER="infra-agent"
if [ "$RUN_AS_ROOT" = "1" ]; then
  SERVICE_USER="root"
fi

if [ -z "$AGENT_TOKEN" ]; then
  echo "ERROR: AGENT_TOKEN is required." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (it creates a system user and a systemd unit)." >&2
  exit 1
fi

# 1. detect OS
if [ ! -f /etc/os-release ] || ! grep -qiE 'ubuntu|debian' /etc/os-release; then
  echo "ERROR: this installer supports Ubuntu/Debian only." >&2
  exit 1
fi

# 2. dedicated non-root user (skipped when RUN_AS_ROOT=1)
if [ "$SERVICE_USER" != "root" ] && ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$INSTALL_DIR" --create-home "$SERVICE_USER"
  echo "Created system user $SERVICE_USER"
fi

# 3. Node.js (only if missing)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 4. fetch/update agent source
mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# npm install must run from the repo root so the @infra-monitor/shared
# workspace package gets symlinked into node_modules — running it from
# apps/agent alone leaves that import unresolved at build time.
cd "$INSTALL_DIR"
npm install
npm run build -w packages/shared
npm run build -w apps/agent

# 5. config
cat > "$INSTALL_DIR/apps/agent/.env" <<EOF
AGENT_TOKEN=$AGENT_TOKEN
API_WS_URL=${API_URL/http/ws}/agent
METRICS_INTERVAL_MS=5000
PROCESS_INTERVAL_MS=5000
PM2_HOME=$PM2_HOME
EOF

if [ "$SERVICE_USER" != "root" ]; then
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
fi
chmod 600 "$INSTALL_DIR/apps/agent/.env"

# 6. systemd service
cat > /etc/systemd/system/infra-monitor-agent.service <<EOF
[Unit]
Description=Infra Monitor server agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/apps/agent
EnvironmentFile=$INSTALL_DIR/apps/agent/.env
ExecStart=$(command -v node) $INSTALL_DIR/apps/agent/dist/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

# 7-8. start + enable
systemctl daemon-reload
systemctl enable infra-monitor-agent
systemctl restart infra-monitor-agent

sleep 2

# 9-10. verify + report
if systemctl is-active --quiet infra-monitor-agent; then
  echo "infra-monitor-agent is running."
  systemctl status infra-monitor-agent --no-pager -l | head -n 15
else
  echo "infra-monitor-agent failed to start. Logs:" >&2
  journalctl -u infra-monitor-agent --no-pager -n 50 >&2
  exit 1
fi
