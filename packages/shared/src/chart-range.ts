/** 차트 API·UI 공통: 봉 단위 × 깊이별 「최근 최대 N봉」과 조회 시간 범위 */

export type ChartGranularity = "minute" | "day" | "month" | "year";
export type ChartRange = "compact" | "normal" | "deep" | "max";

/** 분봉 집계 단위(분). 1=1분봉, DB 1분 버킷과 동일 */
export type ChartMinuteFrame = 1 | 5 | 10 | 30;

export const CHART_MINUTE_FRAMES: ChartMinuteFrame[] = [1, 5, 10, 30];

export function parseChartMinuteFrame(raw: string | undefined): ChartMinuteFrame | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n)) return null;
  return CHART_MINUTE_FRAMES.includes(n as ChartMinuteFrame) ? (n as ChartMinuteFrame) : null;
}

export type ChartRangeConfig = {
  /** 이 깊이에서 가져올 최대 봉 수(최신부터) */
  barCap: number;
  /** 그만큼 과거까지 스캔 (데이터가 희소해도 N봉을 채우기 위한 상한) */
  lookbackMs: number;
};

/**
 * 봉 수·조회 범위. 분봉은 normal/deep/max가 봉 수·lookback 모두 다르게 잡히도록 함.
 */
export const CHART_RANGE_MATRIX: Record<ChartGranularity, Record<ChartRange, ChartRangeConfig>> = {
  minute: {
    compact: { barCap: 180, lookbackMs: 4 * 3600_000 },
    normal: { barCap: 600, lookbackMs: 36 * 3600_000 },
    deep: { barCap: 2500, lookbackMs: 14 * 24 * 3600_000 },
    max: { barCap: 10_000, lookbackMs: 120 * 24 * 3600_000 },
  },
  day: {
    compact: { barCap: 20, lookbackMs: 45 * 24 * 3600_000 },
    normal: { barCap: 90, lookbackMs: 400 * 24 * 3600_000 },
    deep: { barCap: 400, lookbackMs: 5 * 365 * 24 * 3600_000 },
    max: { barCap: 2000, lookbackMs: 22 * 365 * 24 * 3600_000 },
  },
  month: {
    compact: { barCap: 12, lookbackMs: 18 * 30 * 24 * 3600_000 },
    normal: { barCap: 36, lookbackMs: 5 * 365 * 24 * 3600_000 },
    deep: { barCap: 120, lookbackMs: 20 * 365 * 24 * 3600_000 },
    max: { barCap: 240, lookbackMs: 50 * 365 * 24 * 3600_000 },
  },
  year: {
    compact: { barCap: 4, lookbackMs: 6 * 365 * 24 * 3600_000 },
    normal: { barCap: 12, lookbackMs: 20 * 365 * 24 * 3600_000 },
    deep: { barCap: 40, lookbackMs: 60 * 365 * 24 * 3600_000 },
    max: { barCap: 80, lookbackMs: 120 * 365 * 24 * 3600_000 },
  },
};

const RANGE_SHORT_KO: Record<ChartRange, string> = {
  compact: "짧음",
  normal: "보통",
  deep: "깊음",
  max: "최대",
};

export function granularityBarLabel(g: ChartGranularity): string {
  switch (g) {
    case "minute":
      return "분봉";
    case "day":
      return "일봉";
    case "month":
      return "월봉";
    case "year":
      return "연봉";
  }
}

export function formatLookbackKo(ms: number): string {
  if (ms < 90 * 60_000) return `${Math.max(1, Math.round(ms / 60_000))}분`;
  if (ms < 36 * 3600_000) return `${Math.round(ms / 3600_000)}시간`;
  if (ms < 60 * 24 * 3600_000) return `${Math.round(ms / (24 * 3600_000))}일`;
  const mo = ms / (30 * 24 * 3600_000);
  if (mo < 18) return `${Math.max(1, Math.round(mo))}개월`;
  return `${Math.round(ms / (365 * 24 * 3600_000))}년`;
}

/** API meta·요약 문구 */
export function formatChartRangeDescription(g: ChartGranularity, r: ChartRange): string {
  const { barCap, lookbackMs } = CHART_RANGE_MATRIX[g][r];
  return `최근 ${granularityBarLabel(g)} 최대 ${barCap}개 (조회 범위 약 ${formatLookbackKo(lookbackMs)})`;
}

/** UI 버튼: 짧음 · 최대 180개 */
export function chartRangeButtonLabel(g: ChartGranularity, r: ChartRange): string {
  const { barCap } = CHART_RANGE_MATRIX[g][r];
  return `${RANGE_SHORT_KO[r]} · 최대 ${barCap}개`;
}
