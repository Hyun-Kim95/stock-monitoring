import type { NewsItem } from "./mock-news.js";

export type NewsRuleInput = {
  scope: "GLOBAL" | "STOCK";
  stockId: string | null;
  includeKeyword: string | null;
  excludeKeyword: string | null;
  priority: number;
  isActive: boolean;
};

/** URL 기준 중복 제거(먼저 나온 항목 유지) */
export function dedupeNewsByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

/**
 * 적용 규칙: 활성 규칙 중 scope가 GLOBAL이거나 STOCK이면서 stockId가 일치하는 것만.
 * - excludeKeyword가 제목에 포함되면 제외
 * - includeKeyword가 하나라도 있으면, 그 중 하나라도 제목에 포함되어야 통과
 */
export function applyNewsRules(
  items: NewsItem[],
  rules: NewsRuleInput[],
  stockId: string,
): NewsItem[] {
  const applicable = rules.filter(
    (r) =>
      r.isActive &&
      (r.scope === "GLOBAL" || (r.scope === "STOCK" && r.stockId === stockId)),
  );
  applicable.sort((a, b) => b.priority - a.priority);

  const includeRules = applicable.filter((r) => r.includeKeyword?.trim());
  const excludeRules = applicable.filter((r) => r.excludeKeyword?.trim());

  return items.filter((item) => {
    const title = item.title.toLowerCase();
    for (const r of excludeRules) {
      const k = r.excludeKeyword!.trim().toLowerCase();
      if (title.includes(k)) return false;
    }
    if (includeRules.length > 0) {
      const hit = includeRules.some((r) => title.includes(r.includeKeyword!.trim().toLowerCase()));
      if (!hit) return false;
    }
    return true;
  });
}
