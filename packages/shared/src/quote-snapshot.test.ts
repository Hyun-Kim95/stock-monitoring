import { describe, expect, it } from "vitest";
import { QuoteSnapshotSchema, WsServerMessageSchema } from "./quote-snapshot.js";

describe("QuoteSnapshotSchema", () => {
  it("유효 스냅샷 통과", () => {
    const q = {
      symbol: "005930",
      name: "삼성전자",
      price: 70000,
      change: 100,
      changeRate: 0.14,
      volume: 1e6,
      timestamp: new Date().toISOString(),
      marketSession: "OPEN" as const,
      foreignNetBuyVolume: 12000,
      foreignOwnershipPct: 52.3,
    };
    expect(() => QuoteSnapshotSchema.parse(q)).not.toThrow();
  });
});

describe("WsServerMessageSchema", () => {
  it("snapshot 메시지", () => {
    const msg = {
      type: "snapshot" as const,
      quotes: [
        {
          symbol: "005930",
          name: "삼성전자",
          price: 1,
          change: 0,
          changeRate: 0,
          volume: 0,
          timestamp: "t",
          marketSession: "CLOSED" as const,
        },
      ],
    };
    expect(WsServerMessageSchema.parse(msg)).toEqual(msg);
  });
});
