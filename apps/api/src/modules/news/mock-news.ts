import type { Stock } from "@prisma/client";

export type NewsItem = {
  id: string;
  title: string;
  /** 네이버 등 요약(규칙 매칭에 사용, UI 미표시 가능) */
  description?: string | null;
  source: string;
  publishedAt: string;
  url: string;
};

export function buildMockNewsForStock(stock: Pick<Stock, "name" | "code">, limit: number): NewsItem[] {
  const now = Date.now();
  const items: NewsItem[] = [];
  for (let i = 0; i < limit; i++) {
    items.push({
      id: `${stock.code}-${i}`,
      title: `[목데이터] ${stock.name} 관련 시장 이슈 ${i + 1}`,
      description: null,
      source: "데모 뉴스",
      publishedAt: new Date(now - i * 3600_000).toISOString(),
      url: `https://example.com/news/${stock.code}/${i}`,
    });
  }
  return items;
}
