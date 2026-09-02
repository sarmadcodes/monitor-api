"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListOnScrollProps } from "react-window";
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

const ROW_HEIGHT = 24;

interface DisplayLogLine extends LogLine {
  serverName?: string;
}

export function LogViewer({
  logs,
  showServer = false,
  height = 560,
  onLineClick,
}: {
  logs: DisplayLogLine[];
  showServer?: boolean;
  height?: number;
  onLineClick?: (log: DisplayLogLine) => void;
}) {
  const [live, setLive] = useState(true);
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<Set<LogLine["level"]>>(
    new Set(["debug", "info", "warn", "error", "fatal", "unknown"])
  );
  const [autoFollow, setAutoFollow] = useState(true);
  const listRef = useRef<FixedSizeList>(null);
  const ignoreNextScroll = useRef(false);

  // Pausing freezes the visible list without dropping anything server-side —
  // new lines keep arriving into `logs`, we just stop reading from it.
  const [frozenAt, setFrozenAt] = useState<DisplayLogLine[] | null>(null);
  const source = live ? logs : frozenAt ?? logs;

  function togglePause() {
    if (live) setFrozenAt(logs);
    else setFrozenAt(null);
    setLive((v) => !v);
  }

  const filtered = useMemo(() => {
    return source.filter((l) => {
      if (!levels.has(l.level)) return false;
      if (search && !l.raw.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [source, levels, search]);

  useEffect(() => {
    if (autoFollow && listRef.current && filtered.length > 0) {
      ignoreNextScroll.current = true;
      listRef.current.scrollToItem(filtered.length - 1, "end");
    }
  }, [filtered, autoFollow]);

  function handleScroll(props: ListOnScrollProps) {
    if (ignoreNextScroll.current) {
      ignoreNextScroll.current = false;
      return;
    }
    if (props.scrollUpdateWasRequested) return;
    const maxScroll = Math.max(0, filtered.length * ROW_HEIGHT - height);
    const atBottom = props.scrollOffset >= maxScroll - ROW_HEIGHT * 2;
    setAutoFollow(atBottom);
  }

  function jumpToLatest() {
    setAutoFollow(true);
    if (listRef.current && filtered.length > 0) {
      ignoreNextScroll.current = true;
      listRef.current.scrollToItem(filtered.length - 1, "end");
    }
  }

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
    <div className="flex flex-col rounded-lg border border-bg-border bg-[#0d0e11]" style={{ height: height + 48 }}>
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
          onClick={togglePause}
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
        <span className="mono text-[10px] text-status-muted">{filtered.length} lines</span>
        <div className="ml-auto flex gap-1">
          <button onClick={copyAll} className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white">
            Copy all
          </button>
          <button onClick={download} className="rounded-md border border-bg-border px-2 py-1 text-xs text-status-muted hover:text-white">
            Download
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {filtered.length === 0 ? (
          <p className="mono p-3 text-sm text-status-muted">No log lines yet.</p>
        ) : (
          <FixedSizeList
            ref={listRef}
            height={height}
            width="100%"
            itemCount={filtered.length}
            itemSize={ROW_HEIGHT}
            onScroll={handleScroll}
            itemData={{ items: filtered, showServer, onLineClick }}
          >
            {Row}
          </FixedSizeList>
        )}

        {!autoFollow && filtered.length > 0 && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 right-3 rounded-full bg-status-info px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-blue-600"
          >
            ↓ Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: { items: DisplayLogLine[]; showServer: boolean; onLineClick?: (log: DisplayLogLine) => void };
}) {
  const l = data.items[index];
  const isError = l.level === "error" || l.level === "fatal";
  return (
    <div
      style={style}
      onClick={() => data.onLineClick?.(l)}
      className={clsx(
        "mono flex items-center gap-2 whitespace-nowrap px-3 text-[12.5px] leading-6",
        isError && "bg-status-critical/[0.06]",
        data.onLineClick && "cursor-pointer hover:bg-bg-raised/60"
      )}
    >
      <span className="shrink-0 text-status-muted">{formatTime(l.timestamp)}</span>
      {data.showServer && (
        <span className="shrink-0 max-w-[110px] truncate text-status-info/80">{l.serverName}</span>
      )}
      <span
        className={clsx(
          "shrink-0 rounded px-1 text-[9px] font-semibold uppercase",
          l.source === "nginx" ? "bg-purple-500/15 text-purple-300" : l.source === "agent" ? "bg-gray-500/15 text-gray-300" : "bg-blue-500/15 text-blue-300"
        )}
      >
        {l.source}
      </span>
      <span className="shrink-0 max-w-[130px] truncate font-medium text-gray-200">{l.processName}</span>
      <span className={clsx("shrink-0 w-12 font-semibold uppercase", LEVEL_COLORS[l.level])}>{l.level}</span>
      <span
        className="truncate text-gray-200"
        title={l.raw}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(l.raw);
        }}
      >
        {l.message}
      </span>
    </div>
  );
}
