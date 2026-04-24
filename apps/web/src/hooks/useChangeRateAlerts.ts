"use client";

import { useEffect, useRef } from "react";
import { DASHBOARD_OPEN_STOCK_CHART, DASHBOARD_STOCK_CODE_QUERY } from "@/lib/dashboard-open-stock";
import type { QuoteSnapshot } from "@stock-monitoring/shared";

/** 대시보드에서 선택 가능한 전일대비 등락률 알림 기준(상·하 동일 %p) */
export const CHANGE_RATE_ALERT_THRESHOLDS = [5, 10, 15] as const;
export type ChangeRateAlertThresholdPct = (typeof CHANGE_RATE_ALERT_THRESHOLDS)[number];

export function parseChangeRateAlertThreshold(raw: string | null): ChangeRateAlertThresholdPct {
  if (raw === "5" || raw === "10" || raw === "15") {
    return Number(raw) as ChangeRateAlertThresholdPct;
  }
  return 10;
}

/**
 * ±threshold % 알림용 상태.
 * - upArm: 한 번 +threshold 이상이었고, 아직 (threshold - margin) 미만으로 내려오지 않음
 * - downArm: 한 번 -threshold 이하였고, 아직 -(threshold - margin) 초과로 올라오지 않음
 * 히스테리시스로 9.9%↔10.1%처럼 경계를 왔다 갔다 할 때 알림이 반복되지 않게 함.
 */
type ArmZone = "neutral" | "upArm" | "downArm";

function initialArmZone(changeRate: number, threshold: number): ArmZone {
  if (changeRate >= threshold) return "upArm";
  if (changeRate <= -threshold) return "downArm";
  return "neutral";
}

function stepArmZone(
  prev: ArmZone,
  r: number,
  threshold: number,
  margin: number,
): { zone: ArmZone; firedUp: boolean; firedDown: boolean } {
  const t = threshold;
  const exitUp = r < t - margin;
  const exitDown = r > -(t - margin);

  if (prev === "upArm") {
    if (!exitUp) {
      return { zone: "upArm", firedUp: false, firedDown: false };
    }
    if (r <= -t) {
      return { zone: "downArm", firedUp: false, firedDown: true };
    }
    return { zone: "neutral", firedUp: false, firedDown: false };
  }

  if (prev === "downArm") {
    if (!exitDown) {
      return { zone: "downArm", firedUp: false, firedDown: false };
    }
    if (r >= t) {
      return { zone: "upArm", firedUp: true, firedDown: false };
    }
    return { zone: "neutral", firedUp: false, firedDown: false };
  }

  if (r >= t) {
    return { zone: "upArm", firedUp: true, firedDown: false };
  }
  if (r <= -t) {
    return { zone: "downArm", firedUp: false, firedDown: true };
  }
  return { zone: "neutral", firedUp: false, firedDown: false };
}

function notifyCrossing(q: QuoteSnapshot, direction: "up" | "down") {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const title = direction === "up" ? "급등 알림" : "급락 알림";
  const rateStr = `${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(2)}%`;
  const body = `${q.name} (${q.symbol}) 전일대비 ${rateStr}`;
  try {
    const n = new Notification(title, { body });
    n.onclick = () => {
      n.close();
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      const code = q.symbol;
      const path = window.location.pathname;
      const onHome = path === "/" || path === "";
      if (onHome) {
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_OPEN_STOCK_CHART, { detail: { code } }),
        );
      } else {
        window.location.assign(`/?${DASHBOARD_STOCK_CODE_QUERY}=${encodeURIComponent(code)}`);
      }
    };
  } catch {
    /* ignore */
  }
}

/**
 * 전일대비 등락률이 ±threshold %를 넘을 때 브라우저 알림.
 * 같은 급등·급락 구간(경계 진동)에서는 한 번만 울리고, (threshold - margin)% 안쪽으로 충분히 돌아온 뒤
 * 다시 넘을 때만 재알림합니다.
 */
export function useChangeRateAlerts(
  quotes: Map<string, QuoteSnapshot>,
  opts: { enabled: boolean; threshold?: number; hysteresisMargin?: number },
) {
  const threshold = opts.threshold ?? 10;
  /** 경계 흔들림 방지: 기본 1%p (예: 10% 기준 → 9% 미만으로 내려와야 중립으로 간주) */
  const margin = opts.hysteresisMargin ?? 1;
  const zoneBySymbol = useRef<Map<string, ArmZone>>(new Map());
  const seededRef = useRef(false);
  const lastConfigKeyRef = useRef("");

  useEffect(() => {
    if (!opts.enabled) {
      seededRef.current = false;
      zoneBySymbol.current = new Map();
      lastConfigKeyRef.current = "";
      return;
    }

    if (quotes.size === 0) return;

    const configKey = `${threshold}:${margin}`;
    if (lastConfigKeyRef.current !== configKey) {
      lastConfigKeyRef.current = configKey;
      seededRef.current = false;
      zoneBySymbol.current = new Map();
    }

    if (!seededRef.current) {
      for (const [symbol, q] of quotes) {
        zoneBySymbol.current.set(symbol, initialArmZone(q.changeRate, threshold));
      }
      seededRef.current = true;
      return;
    }

    for (const [symbol, q] of quotes) {
      if (!zoneBySymbol.current.has(symbol)) {
        zoneBySymbol.current.set(symbol, initialArmZone(q.changeRate, threshold));
        continue;
      }
      const prev = zoneBySymbol.current.get(symbol)!;
      const { zone, firedUp, firedDown } = stepArmZone(prev, q.changeRate, threshold, margin);
      if (firedUp) {
        void notifyCrossing(q, "up");
      } else if (firedDown) {
        void notifyCrossing(q, "down");
      }
      zoneBySymbol.current.set(symbol, zone);
    }
  }, [quotes, opts.enabled, threshold, margin]);
}
