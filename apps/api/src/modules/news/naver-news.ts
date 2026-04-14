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

function hintForNaverHttpError(status: number, body: string): string {
  let errorCode: string | undefined;
  try {
    errorCode = (JSON.parse(body) as { errorCode?: string }).errorCode;
  } catch {
    /* ignore */
  }
  if (status === 401 && (errorCode === "024" || body.includes("Scope"))) {
    return " — 조치: 네이버 개발자센터(developers.naver.com) → 내 애플리케이션 → 해당 앱 → **API 설정**에서 **검색** 사용을 추가했는지 확인하고, `.env`의 ID/Secret이 그 앱 것인지 확인하세요.";
  }
  if (status === 401) {
    return " — 조치: Client ID/Secret 오타 또는 다른 애플리케이션의 키를 쓰고 있지 않은지 확인하세요.";
  }
  return "";
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
    const hint = hintForNaverHttpError(res.status, text);
    throw new Error(`네이버 뉴스 HTTP ${res.status}: ${text.slice(0, 240)}${hint}`);
  }
  let json: NaverNewsResponse;
  try {
    json = JSON.parse(text) as NaverNewsResponse;
  } catch {
    throw new Error(`네이버 뉴스 응답 JSON 파싱 실패: ${text.slice(0, 120)}`);
  }
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
      description: stripHtml(it.description ?? "").trim() || null,
      source: "네이버 뉴스",
      publishedAt: parsePubDate(it.pubDate),
      url: link,
    });
  }
  return out;
}
