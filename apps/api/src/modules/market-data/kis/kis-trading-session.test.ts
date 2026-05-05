import { describe, expect, it } from "vitest";
import { kstYmdForInstant, readStckBsopYmd, shouldForceClosedMarketSessionByBsop } from "./kis-trading-session.js";

describe("readStckBsopYmd", () => {
  it("reads snake_case and SCREAMING keys", () => {
    expect(readStckBsopYmd({ stck_bsop_date: "20260502" })).toBe("20260502");
    expect(readStckBsopYmd({ STCK_BSOP_DATE: "20260502" })).toBe("20260502");
    expect(readStckBsopYmd({})).toBe(null);
    expect(readStckBsopYmd({ stck_bsop_date: "bad" })).toBe(null);
  });
});

describe("shouldForceClosedMarketSessionByBsop", () => {
  it("REGULAR with bsop before today → true (e.g. holiday weekday)", () => {
    expect(shouldForceClosedMarketSessionByBsop("REGULAR", "20260502", "20260505")).toBe(true);
  });
  it("PRE excluded (avoid Mon pre-open false positive)", () => {
    expect(shouldForceClosedMarketSessionByBsop("PRE", "20260502", "20260505")).toBe(false);
  });
  it("OFF excluded", () => {
    expect(shouldForceClosedMarketSessionByBsop("OFF", "20260502", "20260505")).toBe(false);
  });
  it("same calendar day as bsop → false", () => {
    expect(shouldForceClosedMarketSessionByBsop("REGULAR", "20260505", "20260505")).toBe(false);
  });
  it("NXT with stale bsop → true", () => {
    expect(shouldForceClosedMarketSessionByBsop("NXT", "20260502", "20260505")).toBe(true);
  });
  it("AFTER with stale bsop → true", () => {
    expect(shouldForceClosedMarketSessionByBsop("AFTER", "20260502", "20260505")).toBe(true);
  });
});

describe("kstYmdForInstant", () => {
  it("uses Asia/Seoul calendar date", () => {
    const d = new Date("2026-05-05T03:00:00.000Z");
    expect(kstYmdForInstant(d)).toBe("20260505");
  });
});
