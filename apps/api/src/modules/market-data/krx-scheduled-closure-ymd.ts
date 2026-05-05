/**
 * KRX **전일 휴장** KST 달력(YYYYMMDD) — mock·`kis-polling-provider` 캘린더 보강.
 * KIS 경로는 `stck_bsop_date` 우선.
 *
 * - **자동**: `date-holidays` 대한민국(`KR`) 공휴일(양력·음력 규칙 포함, 패키지 갱신으로 연도 확장).
 * - **수동 보조(`KRX_EXTRA_CLOSURE_YMD`)**: 라이브러리에 없거나 규칙이 다른 KRX 전용 휴장만
 *   (설 전일·임시공휴일·선거일·연말 휴장 등). KRX 공지 나올 때마다 최소한만 추가·정리.
 */

import Holidays from "date-holidays";

let _krHolidays: Holidays | null = null;

function getKrHolidays(): Holidays {
  if (!_krHolidays) _krHolidays = new Holidays("KR");
  return _krHolidays;
}

/** KST 달력 해당일 정오 — 공휴일 조회 시 날짜 경계 오류 방지 */
function kstNoonFromYmd(ymd: string): Date | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T12:00:00+09:00`);
}

/** 대한민국 공휴일( date-holidays `KR` ) 여부, KST 달력 YYYYMMDD 기준 */
export function isKoreanPublicHolidayKstYmd(ymd: string): boolean {
  const dt = kstNoonFromYmd(ymd);
  if (!dt) return false;
  return !!getKrHolidays().isHoliday(dt);
}

/**
 * `date-holidays`가 다루지 않는 KRX 전일 휴장만 명시.
 * (예: 2026-02-16 설 전일, 대체공휴일 일부, 지방선거, 연말 휴장)
 */
const KRX_EXTRA_CLOSURE_YMD = new Set<string>([
  "20260216",
  "20260302",
  "20260603",
  "20261005",
  "20261231",
]);

export function isKrxScheduledFullDayClosureKstYmd(ymd: string): boolean {
  return KRX_EXTRA_CLOSURE_YMD.has(ymd) || isKoreanPublicHolidayKstYmd(ymd);
}

/** KST 달력 연도 */
export function kstCalendarYearForInstant(d: Date = new Date()): number {
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" })
    .formatToParts(d)
    .find((p) => p.type === "year")?.value;
  return y ? Number(y) : d.getUTCFullYear();
}
