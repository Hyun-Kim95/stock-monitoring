/**
 * KRX 세션 보조 판정.
 *
 * 원인: `kstSessionSlotAndMinutesForInstant()`는 주말만 제외하고 KST 시각만 보므로, 평일 공휴일에도 REGULAR → OPEN이 됨.
 * KIS `inquire-price` output의 `stck_bsop_date`(주식 영업일)가 KST 달력 ‘오늘’보다 이전이면
 * 아직 직전 영업일 기준 시세로, 장중 슬롯이어도 실제 매매는 없는 경우가 많음(공휴일 등).
 *
 * PRE는 월요 프리장에서 영업일 필드가 아직 전주로 남는 등 오탐 가능성이 있어 제외.
 */

export type KrxSessionSlot = "OFF" | "PRE" | "REGULAR" | "NXT" | "AFTER";

/**
 * KST 기준 세션 슬롯과 자정부터의 경과 분(0~1439).
 * 7:30~8:00 PRE, 8:00~15:30 REGULAR(단일가·정규, 분봉 8시~ 정합). 8:00~8:59 REGULAR 구간은 차트 백필과 같이
 * NXT 적격 종목의 `inquire-price`가 J보다 NX 구분에서 먼저 유효한 경우가 많아 `shouldProbeKisNxPriceFirst`와 함께 쓴다.
 * NXT 15:30~20:00, AFTER 20:00~20:30.
 */
export function kstSessionSlotAndMinutesForInstant(d: Date): { slot: KrxSessionSlot; mins: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") {
    return { slot: "OFF", mins: 0 };
  }

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  let slot: KrxSessionSlot;
  if (mins >= 7 * 60 + 30 && mins < 8 * 60) slot = "PRE";
  else if (mins >= 8 * 60 && mins < 15 * 60 + 30) slot = "REGULAR";
  else if (mins >= 15 * 60 + 30 && mins < 20 * 60) slot = "NXT";
  else if (mins >= 20 * 60 && mins < 20 * 60 + 30) slot = "AFTER";
  else slot = "OFF";

  return { slot, mins };
}

/** KIS 현재가 NX 선조회: 저녁 NXT·시간외 + 정규장 8~9시(분봉 백필과 동일 정책, `kis-chart-backfill`). */
export function shouldProbeKisNxPriceFirst(slot: KrxSessionSlot, mins: number): boolean {
  if (slot === "NXT" || slot === "AFTER") return true;
  if (slot === "REGULAR" && mins >= 8 * 60 && mins < 9 * 60) return true;
  return false;
}

/** KST 기준 YYYYMMDD */
export function kstYmdForInstant(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

/** KIS 국내주식 현재가 등 output에서 주식 영업일(YYYYMMDD) 추출 */
export function readStckBsopYmd(out: Record<string, string | undefined>): string | null {
  const v = String(out.stck_bsop_date ?? out.STCK_BSOP_DATE ?? "").trim();
  if (!/^\d{8}$/.test(v)) return null;
  return v;
}

/**
 * 시세의 영업일이 오늘(KST)보다 이전이면 직전 세션 기준으로 보고, 장중 슬롯이어도 CLOSED로 강제.
 * (mock 등 KIS 필드가 없으면 false)
 */
export function shouldForceClosedMarketSessionByBsop(
  slot: KrxSessionSlot,
  bsopYmd: string | null,
  todayYmd: string,
): boolean {
  if (slot === "OFF" || slot === "PRE") return false;
  if (!bsopYmd || !/^\d{8}$/.test(todayYmd)) return false;
  const b = Number(bsopYmd);
  const t = Number(todayYmd);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return false;
  return b < t;
}
