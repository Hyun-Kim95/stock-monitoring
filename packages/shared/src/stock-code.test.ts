import { describe, expect, it } from "vitest";
import { normalizeKrxStockCode } from "./stock-code.js";

describe("normalizeKrxStockCode", () => {
  it("선행 0 없이 입력해도 6자리로 맞춤", () => {
    expect(normalizeKrxStockCode("5930")).toBe("005930");
    expect(normalizeKrxStockCode("5380")).toBe("005380");
  });
  it("이미 6자리면 유지", () => {
    expect(normalizeKrxStockCode("005930")).toBe("005930");
  });
  it("공백·하이픈 제거", () => {
    expect(normalizeKrxStockCode(" 005-930 ")).toBe("005930");
  });
});
