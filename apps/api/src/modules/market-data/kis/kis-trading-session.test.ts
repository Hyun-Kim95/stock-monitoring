import { describe, expect, it } from "vitest";
import {
  kstSessionSlotAndMinutesForInstant,
  kstYmdForInstant,
  readStckBsopYmd,
  shouldForceClosedMarketSessionByBsop,
  shouldProbeKisNxPriceFirst,
} from "./kis-trading-session.js";

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

describe("shouldProbeKisNxPriceFirst", () => {
  it("NXT and AFTER slots → true (mins ignored)", () => {
    expect(shouldProbeKisNxPriceFirst("NXT", 0)).toBe(true);
    expect(shouldProbeKisNxPriceFirst("AFTER", 999)).toBe(true);
  });
  it("REGULAR 08:00~08:59 KST → true", () => {
    expect(shouldProbeKisNxPriceFirst("REGULAR", 8 * 60)).toBe(true);
    expect(shouldProbeKisNxPriceFirst("REGULAR", 8 * 60 + 59)).toBe(true);
  });
  it("REGULAR at 09:00 KST → false", () => {
    expect(shouldProbeKisNxPriceFirst("REGULAR", 9 * 60)).toBe(false);
  });
  it("REGULAR before 08:00 → false", () => {
    expect(shouldProbeKisNxPriceFirst("REGULAR", 7 * 60 + 59)).toBe(false);
  });
  it("PRE and OFF → false", () => {
    expect(shouldProbeKisNxPriceFirst("PRE", 7 * 60 + 45)).toBe(false);
    expect(shouldProbeKisNxPriceFirst("OFF", 0)).toBe(false);
  });
});

describe("kstSessionSlotAndMinutesForInstant", () => {
  it("Tuesday 2026-05-05 08:30 KST → REGULAR, 510 mins", () => {
    const d = new Date("2026-05-04T23:30:00.000Z");
    const { slot, mins } = kstSessionSlotAndMinutesForInstant(d);
    expect(slot).toBe("REGULAR");
    expect(mins).toBe(8 * 60 + 30);
    expect(shouldProbeKisNxPriceFirst(slot, mins)).toBe(true);
  });
  it("Tuesday 2026-05-05 09:00 KST → REGULAR, NX probe off", () => {
    const d = new Date("2026-05-05T00:00:00.000Z");
    const { slot, mins } = kstSessionSlotAndMinutesForInstant(d);
    expect(slot).toBe("REGULAR");
    expect(mins).toBe(9 * 60);
    expect(shouldProbeKisNxPriceFirst(slot, mins)).toBe(false);
  });
});
