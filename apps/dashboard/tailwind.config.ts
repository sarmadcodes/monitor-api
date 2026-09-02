import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0b0d",
          panel: "#111317",
          raised: "#16181d",
          border: "#22252b",
        },
        status: {
          healthy: "#22c55e",
          warning: "#eab308",
          critical: "#ef4444",
          info: "#3b82f6",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
