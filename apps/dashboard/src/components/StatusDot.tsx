import clsx from "clsx";

export type DotColor = "healthy" | "warning" | "critical" | "info" | "muted";

export function StatusDot({ color, pulse = false }: { color: DotColor; pulse?: boolean }) {
  const colors: Record<DotColor, string> = {
    healthy: "bg-status-healthy shadow-[0_0_6px_rgba(34,197,94,0.6)]",
    warning: "bg-status-warning shadow-[0_0_6px_rgba(234,179,8,0.6)]",
    critical: "bg-status-critical shadow-[0_0_6px_rgba(239,68,68,0.6)]",
    info: "bg-status-info shadow-[0_0_6px_rgba(59,130,246,0.6)]",
    muted: "bg-status-muted",
  };
  return (
    <span
      className={clsx("inline-block h-2 w-2 rounded-full", colors[color], pulse && "live-dot")}
    />
  );
}
