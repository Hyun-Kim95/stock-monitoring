/**
 * 네이버 모바일 종목 API
 * - integration: 산업대분류 코드(industryCode)
 * - basic: 상장 시장(stockExchangeType) — integration 루트에는 시장 정보가 없음
 */
export type NaverStockIntegrationMeta = {
  industryMajorCode: string | null;
  /** KOSPI, KOSDAQ, KONEX 등 */
  market: string | null;
};

const KO_MARKET_TO_EN: Record<string, string> = {
  코스피: "KOSPI",
  코스닥: "KOSDAQ",
  코넥스: "KONEX",
};

/** API·UI 표시용: DB에 한글이 남아 있어도 영문으로 통일 */
export function toMarketLabelEn(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const mapped = KO_MARKET_TO_EN[t];
  if (mapped) return mapped;
  if (/^[A-Za-z]{2,12}$/.test(t)) return t.toUpperCase();
  return t;
}

const jsonHeaders = { Accept: "application/json", "User-Agent": "stock-monitoring/1.0" };

export async function fetchNaverStockIntegrationMeta(stockCode: string): Promise<NaverStockIntegrationMeta> {
  const enc = encodeURIComponent(stockCode);
  try {
    const [intRes, basicRes] = await Promise.all([
      fetch(`https://m.stock.naver.com/api/stock/${enc}/integration`, { headers: jsonHeaders }),
      fetch(`https://m.stock.naver.com/api/stock/${enc}/basic`, { headers: jsonHeaders }),
    ]);

    let industryMajorCode: string | null = null;
    if (intRes.ok) {
      const j = (await intRes.json()) as { industryCode?: unknown };
      const ind = String(j.industryCode ?? "").trim();
      industryMajorCode = ind || null;
    }

    let market: string | null = null;
    if (basicRes.ok) {
      const j = (await basicRes.json()) as {
        stockExchangeType?: { nameKor?: unknown; name?: unknown; nameEng?: unknown };
      };
      const ex = j.stockExchangeType;
      const raw =
        String(ex?.nameEng ?? "").trim() ||
        String(ex?.name ?? "").trim() ||
        String(ex?.nameKor ?? "").trim() ||
        "";
      market = toMarketLabelEn(raw);
    }

    return { industryMajorCode, market };
  } catch {
    return { industryMajorCode: null, market: null };
  }
}
