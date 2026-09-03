import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  adminUsername: required("ADMIN_USERNAME", "admin"),
  adminPassword: required("ADMIN_PASSWORD", "change-me"),
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  dashboardOrigin: process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000",
  dataFile: process.env.DATA_FILE ?? "./data/servers.json",
  // Where the permanent IP blocklist lives. Defaults next to DATA_FILE so it
  // inherits the same "must be an absolute path outside the app's deploy
  // directory" requirement — see .env.example.
  blockedIpsFile: process.env.BLOCKED_IPS_FILE ?? "./data/blocked-ips.json",

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    alertTo: process.env.ALERT_TO_EMAIL,
  },
};

export const smtpConfigured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.smtp.alertTo);
