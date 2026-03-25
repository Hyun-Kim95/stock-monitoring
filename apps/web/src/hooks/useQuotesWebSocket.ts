"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuoteSnapshot, WsServerMessage } from "@stock-monitoring/shared";

const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws/quotes";

export function useQuotesWebSocket() {
  const [quotes, setQuotes] = useState<Map<string, QuoteSnapshot>>(new Map());
  const [connected, setConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | undefined>();
  const [statusLoading, setStatusLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);

  const applyMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === "snapshot") {
      setQuotes(new Map(msg.quotes.map((q) => [q.symbol, q])));
    }
    if (msg.type === "quote_update") {
      setQuotes((prev) => {
        const next = new Map(prev);
        next.set(msg.quote.symbol, msg.quote);
        return next;
      });
    }
    if (msg.type === "status") {
      setStatusMsg(msg.message);
    }
  }, []);

  useEffect(() => {
    let stopped = false;

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        backoffRef.current = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (stopped) return;
        const delay = Math.min(backoffRef.current, 30_000);
        backoffRef.current = Math.min(backoffRef.current * 1.5, 30_000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(String(ev.data)) as WsServerMessage;
          applyMessage(raw);
        } catch {
          /* ignore */
        }
      };
    }

    connect();
    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, [applyMessage]);

  return { quotes, connected, statusMsg, statusLoading };
}
