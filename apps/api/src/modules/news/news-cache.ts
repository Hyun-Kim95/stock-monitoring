import type { NewsItem } from "./mock-news.js";

type Entry = { expiresAt: number; items: NewsItem[] };

/** 종목별 뉴스 목록 TTL 캐시 (메모리) */
export class NewsMemoryCache {
  private store = new Map<string, Entry>();

  get(stockId: string, now = Date.now()): NewsItem[] | null {
    const row = this.store.get(stockId);
    if (!row || row.expiresAt <= now) {
      if (row) this.store.delete(stockId);
      return null;
    }
    return row.items;
  }

  set(stockId: string, items: NewsItem[], ttlMs: number, now = Date.now()): void {
    this.store.set(stockId, { expiresAt: now + Math.max(1000, ttlMs), items });
  }

  invalidate(stockId?: string): void {
    if (stockId) this.store.delete(stockId);
    else this.store.clear();
  }
}
