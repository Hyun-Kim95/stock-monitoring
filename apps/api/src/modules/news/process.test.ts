import { describe, expect, it } from "vitest";
import { applyNewsRules, dedupeNewsByUrl } from "./process.js";

describe("dedupeNewsByUrl", () => {
  it("URL 중복 제거", () => {
    const items = [
      { id: "1", title: "a", source: "s", publishedAt: "", url: "https://x/1" },
      { id: "2", title: "b", source: "s", publishedAt: "", url: "https://x/1" },
      { id: "3", title: "c", source: "s", publishedAt: "", url: "https://x/2" },
    ];
    expect(dedupeNewsByUrl(items)).toHaveLength(2);
  });
});

describe("applyNewsRules", () => {
  const base = [
    { id: "1", title: "삼성전자 실적", source: "s", publishedAt: "", url: "https://x/1" },
    { id: "2", title: "광고 배너", source: "s", publishedAt: "", url: "https://x/2" },
    { id: "3", title: "기타 뉴스", source: "s", publishedAt: "", url: "https://x/3" },
  ];

  it("excludeKeyword 제거", () => {
    const rules = [
      {
        scope: "GLOBAL" as const,
        stockId: null,
        includeKeyword: null,
        excludeKeyword: "광고",
        priority: 0,
        isActive: true,
      },
    ];
    const out = applyNewsRules(base, rules, "any");
    expect(out.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("includeKeyword — STOCK 규칙 적용", () => {
    const rules = [
      {
        scope: "STOCK" as const,
        stockId: "stock-a",
        includeKeyword: "삼성전자",
        excludeKeyword: null,
        priority: 10,
        isActive: true,
      },
    ];
    const out = applyNewsRules(base, rules, "stock-a");
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });
});
