import type { NewsItem } from "./mock-news.js";

type NaverNewsItem = {
  title?: string;
  originallink?: string;
  link?: string;
  description?: string;
  pubDate?: string;
};

type NaverNewsResponse = {
  items?: NaverNewsItem[];
  errorMessage?: string;
  errorCode?: string;
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function parsePubDate(pub?: string): string {
  if (!pub) return new Date().toISOString();
  const d = new Date(pub);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function buildNaverNewsQuery(stock: { name: string; searchAlias: string | null }): string {
  const parts = [stock.name.trim()];
  if (stock.searchAlias) {
    for (const a of stock.searchAlias.split(/[,，]/)) {
      const t = a.trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(" ").slice(0, 200);
}

export async function fetchNaverNews(
  clientId: string,
  clientSecret: string,
  query: string,
  display: number,
): Promise<NewsItem[]> {
  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`네이버 뉴스 API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as NaverNewsResponse;
  if (json.errorCode) {
    throw new Error(`네이버 뉴스 ${json.errorCode}: ${json.errorMessage ?? ""}`);
  }
  const items = json.items ?? [];
  const out: NewsItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const link = (it.originallink || it.link || "").trim();
    if (!link) continue;
    out.push({
      id: link,
      title: stripHtml(it.title ?? "").trim() || "(제목 없음)",
      source: "네이버 뉴스",
      publishedAt: parsePubDate(it.pubDate),
      url: link,
    });
  }
  return out;
}
