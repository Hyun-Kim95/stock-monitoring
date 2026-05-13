import type { NewsItem } from "./mock-news.js";

export type NewsRuleInput = {
  scope: "GLOBAL" | "STOCK";
  stockId: string | null;
  includeKeyword: string | null;
  excludeKeyword: string | null;
  priority: number;
  isActive: boolean;
};

/** 공백·대소문자 차이를 무시하고 부분 일치 검사(예: 제목 `삼성 전자` ↔ 키워드 `삼성전자`) */
function normalizeForKeywordMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function haystackForRules(item: NewsItem): string {
  const d = item.description?.trim() ?? "";
  return normalizeForKeywordMatch(`${item.title} ${d}`);
}

/** `publishedAt`(ISO) 기준 최근 `maxAgeDays`일 이내만 유효. 파싱 불가·누락은 제외. */
export function filterNewsPublishedWithinDays(items: NewsItem[], maxAgeDays: number): NewsItem[] {
  const ms = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ms;
  return items.filter((item) => {
    const t = Date.parse(item.publishedAt);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/** 추적·클릭 식별 쿼리는 중복 비교 시 제외(원문 `url` 필드는 그대로 유지) */
const TRACKING_SEARCH_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "spm",
  "mkt_tok",
  "ved",
]);

/**
 * 동일 기사가 `http`/`https`, `www`, 쿼리스트링(utm 등)만 달리해 여러 번 올 때 한 건으로 본다.
 * 파싱 실패 시 trim+소문자 문자열만 사용한다.
 */
export function normalizeNewsUrlForDedupe(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return s.toLowerCase();
  }
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const params = new URLSearchParams(u.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_SEARCH_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path) path = "/";
  return `https://${host}${path}${qs}`;
}

function stripHtmlLite(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** 제목만 다른 인코딩/공백으로 중복 판정이 갈리지 않도록 */
function normalizeTitleForDedupe(title: string): string {
  return stripHtmlLite(title).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 네이버가 같은 기사를 `originallink` / `link`(네이버) 등 서로 다른 URL로 줄 때.
 * 같은 분(분 단위) + 정규화 제목이 같으면 먼저 나온 항목만 유지한다.
 */
export function dedupeNewsByTitleAndMinute(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    const t = Date.parse(item.publishedAt);
    const minuteKey = Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 16);
    const key = `${normalizeTitleForDedupe(item.title)}|${minuteKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** URL 정규화 키 기준 중복 제거(먼저 나온 항목 유지, `item.url`은 변경하지 않음) */
export function dedupeNewsByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    const k = normalizeNewsUrlForDedupe(item.url);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** 표시 직전 파이프라인: URL 정규화 중복 제거 → 제목+분 단위 중복 제거 */
export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  return dedupeNewsByTitleAndMinute(dedupeNewsByUrl(items));
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
    const hay = haystackForRules(item);
    for (const r of excludeRules) {
      const k = normalizeForKeywordMatch(r.excludeKeyword!.trim());
      if (k && hay.includes(k)) return false;
    }
    if (includeRules.length > 0) {
      const hit = includeRules.some((r) => {
        const k = normalizeForKeywordMatch(r.includeKeyword!.trim());
        return k && hay.includes(k);
      });
      if (!hit) return false;
    }
    return true;
  });
}
