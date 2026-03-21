import type { QuoteSnapshot } from "@stock-monitoring/shared";

export class QuoteCache {
  private map = new Map<string, QuoteSnapshot>();

  setMany(quotes: QuoteSnapshot[]) {
    for (const q of quotes) {
      this.map.set(q.symbol, q);
    }
  }

  upsert(q: QuoteSnapshot) {
    this.map.set(q.symbol, q);
  }

  getAll(): QuoteSnapshot[] {
    return [...this.map.values()];
  }

  snapshot(): QuoteSnapshot[] {
    return this.getAll();
  }
}
