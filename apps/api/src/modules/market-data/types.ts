import type { QuoteSnapshot } from "@stock-monitoring/shared";

/**
 * 외부 시세 소스 어댑터. Phase 4.1의 connect/subscribe는
 * `start(symbols)`가 구독 집합을 한 번에 적용하고, `stop()`이 연결 해제에 대응.
 */
export type MarketDataProvider = {
  start(symbols: { code: string; name: string }[]): void;
  stop(): void;
  getQuotes(): QuoteSnapshot[];
  /** 매 틱마다 전체 스냅샷(또는 갱신분) — 다종목 동시 반영용 */
  onTick(cb: (quotes: QuoteSnapshot[]) => void): void;
  isConnected(): boolean;
  /** 외부 시세 소스 상태 메시지 (선택) */
  getStatusMessage?: () => string;
  /** 종목코드 → NXT(넥스트) 시세 조회 가능 여부. 미판별은 null (KIS 전용) */
  getNxEligibilityByCode?: () => Record<string, boolean | null>;
};
