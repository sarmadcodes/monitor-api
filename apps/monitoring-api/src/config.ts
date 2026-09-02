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
};
