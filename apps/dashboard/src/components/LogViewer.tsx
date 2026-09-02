"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { LogLine } from "@infra-monitor/shared";
import { formatTime } from "@/lib/format";

const LEVEL_COLORS: Record<LogLine["level"], string> = {
  debug: "text-status-muted",
  info: "text-status-info",
  warn: "text-status-warning",
  error: "text-status-critical",
  fatal: "text-status-critical",
  unknown: "text-gray-300",
};

export function LogViewer({ logs }: { logs: LogLine[] }) {
  const [live, setLive] = useState(true);
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<Set<LogLine["level"]>>(
    new Set(["debug", "info", "warn", "error", "fatal", "unknown"])
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (!levels.has(l.level)) return false;
      if (search && !l.raw.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, levels, search]);

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [filtered, live]);

  function toggleLevel(level: LogLine["level"]) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  function copyAll() {
    navigator.clipboard.writeText(filtered.map((l) => l.raw).join("\n"));
  }

  function download() {
    const blob = new Blob([filtered.map((l) => l.raw).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logs.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-[560px] flex-col rounded-lg border border-bg-border bg-[#0d0e11]">
      <div className="flex flex-wrap items-center gap-2 border-b border-bg-border p-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-status-muted">
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              live ? "bg-status-healthy live-dot" : "bg-status-muted"
            )}
          />
          {live ? "LIVE" : "PAUSED"}
        </span>
        <button
          onClick={() => setLive((v) => !v)}
          className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white"
        >
          {live ? "Pause" : "Resume"}
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="mono ml-1 w-40 rounded-md border border-bg-border bg-bg-raised px-2 py-1 text-xs text-white outline-none focus:border-status-info"
        />
        <div className="ml-1 flex gap-1">
          {(["debug", "info", "warn", "error", "fatal"] as const).map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={clsx(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                levels.has(level) ? LEVEL_COLORS[level] : "text-status-muted/40",
                "border border-bg-border"
              )}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button onClick={copyAll} className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white">
            Copy all
          </button>
          <button onClick={download} className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white">
            Download
          </button>
        </div>
      </div>
      <div ref={containerRef} className="mono flex-1 overflow-y-auto p-3 text-[12.5px] leading-relaxed">
        {filtered.length === 0 && <p className="text-status-muted">No log lines yet.</p>}
        {filtered.map((l, i) => (
          <div key={i} className="flex gap-2 whitespace-pre-wrap break-all">
            <span className="shrink-0 text-status-muted">{formatTime(l.timestamp)}</span>
            <span className={clsx("shrink-0 w-12 font-semibold uppercase", LEVEL_COLORS[l.level])}>{l.level}</span>
            <span
              className="cursor-pointer text-gray-200 hover:text-white"
              title="Click to copy"
              onClick={() => navigator.clipboard.writeText(l.raw)}
            >
              {l.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
