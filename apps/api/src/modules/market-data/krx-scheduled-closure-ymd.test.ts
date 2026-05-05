import Holidays from "date-holidays";
import { describe, expect, it } from "vitest";
import {
  isKoreanPublicHolidayKstYmd,
  isKrxScheduledFullDayClosureKstYmd,
  kstCalendarYearForInstant,
} from "./krx-scheduled-closure-ymd.js";

describe("isKrxScheduledFullDayClosureKstYmd", () => {
  it("어린이날(공휴일 자동)", () => {
    expect(isKrxScheduledFullDayClosureKstYmd("20260505")).toBe(true);
  });
  it("EXTRA: 설 전일", () => {
    expect(isKrxScheduledFullDayClosureKstYmd("20260216")).toBe(true);
  });
  it("평일 비휴장", () => {
    expect(isKrxScheduledFullDayClosureKstYmd("20260506")).toBe(false);
  });
});

describe("isKoreanPublicHolidayKstYmd", () => {
  it("설날 연휴 중 하루는 공휴일로 인식", () => {
    expect(isKoreanPublicHolidayKstYmd("20260217")).toBe(true);
  });
});

describe("KRX 휴장 캘린더(자동 + 보조)", () => {
  it("date-holidays KR가 KST 현재·다음 연도에 휴일 목록을 제공한다", () => {
    const hd = new Holidays("KR");
    const y = kstCalendarYearForInstant(new Date());
    expect(hd.getHolidays(y).length).toBeGreaterThan(0);
    expect(hd.getHolidays(y + 1).length).toBeGreaterThan(0);
  });
  it("당해 신정은 휴장으로 처리된다", () => {
    const y = kstCalendarYearForInstant(new Date());
    expect(isKrxScheduledFullDayClosureKstYmd(`${y}0101`)).toBe(true);
  });
});

describe("kstCalendarYearForInstant", () => {
  it("uses Asia/Seoul calendar year", () => {
    const d = new Date("2026-05-05T03:00:00.000Z");
    expect(kstCalendarYearForInstant(d)).toBe(2026);
  });
});
