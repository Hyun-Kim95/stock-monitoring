/**
 * KRX/KIS 조회에 쓰는 6자리 종목코드로 맞춥니다(선행 0 포함).
 * `5930` → `005930`. 잘못된 입력은 다른 종목 시세로 이어질 수 있습니다.
 */
export function normalizeKrxStockCode(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (digits.length <= 6) return digits.padStart(6, "0");
  return digits.slice(-6);
}
