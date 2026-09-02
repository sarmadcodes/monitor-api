"use client";

import { useEffect, useRef } from "react";
import type { ApiToDashboardMessage } from "@infra-monitor/shared";
import { WS_URL } from "./api";
import { useDashboardStore } from "./store";

export function useLiveConnection(enabled: boolean) {
  const attempt = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const { setWsStatus, setSnapshot, upsertServer, markOffline, markOnline, appendLog, applyHealth } =
      useDashboardStore.getState();

    function connect() {
      if (cancelled) return;
      setWsStatus(attempt.current === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt.current = 0;
        setWsStatus("connected");
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ApiToDashboardMessage;
        switch (msg.type) {
          case "snapshot":
            setSnapshot(msg.servers);
            break;
          case "server:update":
            upsertServer(msg.server);
            break;
          case "server:offline":
            markOffline(msg.serverId, msg.lastSeen);
            break;
          case "server:online":
            markOnline(msg.serverId);
            break;
          case "log:new":
            appendLog(msg.serverId, msg.data);
            break;
          case "health:update":
            applyHealth(msg.serverId, msg.data);
            break;
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setWsStatus("reconnecting");
        const delay = Math.min(1000 * 2 ** attempt.current, 30000);
        attempt.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
      useDashboardStore.getState().setWsStatus("disconnected");
    };
  }, [enabled]);
}
