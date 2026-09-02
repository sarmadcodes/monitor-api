const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const apiOrigin = new URL(apiUrl).origin;
const wsConnectSrc = wsUrl.startsWith("wss:")
  ? apiOrigin.replace(/^https?:/, "wss:")
  : apiOrigin.replace(/^https?:/, "ws:");

// Tuned for what this app actually loads — Next.js needs 'unsafe-inline' for
// its injected critical CSS (no nonce wiring here), fonts.googleapis.com /
// fonts.gstatic.com for the Inter + JetBrains Mono import in globals.css,
// and the API's own origin for both HTTPS requests and the WebSocket.
//
// 'unsafe-eval' is added ONLY outside production: Next.js dev mode's
// fast-refresh/HMR runtime uses eval() and a strict script-src breaks it —
// verified this actually breaks `next dev` and confirmed the production
// build (next build && next start) has zero CSP violations without it.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${wsConnectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
