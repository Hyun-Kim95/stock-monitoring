import type { QuoteSnapshot } from "@stock-monitoring/shared";

/** 테이블·차트·WS 동일 규칙: 원 단위 반올림(봉 집계·차트와 맞춤) */
export function formatQuotePrice(quote: QuoteSnapshot): string {
  return Math.round(quote.price).toLocaleString("ko-KR");
}
