import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { QuoteSnapshot } from "@stock-monitoring/shared";
import {
  CHART_RANGE_MATRIX,
  formatChartRangeDescription,
  type ChartGranularity,
  type ChartMinuteFrame,
  type ChartRange,
} from "@stock-monitoring/shared";

export type { ChartGranularity, ChartRange };

function windowParams(
  granularity: ChartGranularity,
  range: ChartRange,
  limitOverride?: number,
): { from: Date; cap: number } {
  const { barCap, lookbackMs } = CHART_RANGE_MATRIX[granularity][range];
  const capBase =
    limitOverride != null && Number.isFinite(limitOverride)
      ? Math.max(10, Math.min(20_000, Math.floor(limitOverride)))
      : barCap;
  return {
    from: new Date(Date.now() - lookbackMs),
    cap: Math.min(20_000, Math.max(10, capBase)),
  };
}

export function describeChartWindow(granularity: ChartGranularity, range: ChartRange): string {
  return formatChartRangeDescription(granularity, range);
}

type OhlcRow = {
  period: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
};

function mapOhlcRows(rows: OhlcRow[]): { t: string; open: number; high: number; low: number; close: number }[] {
  return rows
    .filter(
      (r) =>
        r.open != null &&
        r.high != null &&
        r.low != null &&
        r.close != null &&
        !Number.isNaN(Number(r.open)) &&
        !Number.isNaN(Number(r.high)) &&
        !Number.isNaN(Number(r.low)) &&
        !Number.isNaN(Number(r.close)),
    )
    .map((r) => ({
      t: r.period.toISOString(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
}

export type ChartMeta = {
  windowFrom: string;
  windowLabelKo: string;
  limitCap: number;
  barCount: number;
  historyFirstAt: string | null;
  historyLastAt: string | null;
  /** 저장 구간이 요청보다 짧을 때 안내 */
  hintKo: string | null;
  /** 분봉일 때만: 집계 프레임(분) */
  minuteFrame?: ChartMinuteFrame;
};

export type ChartBundle = {
  candles: { t: string; open: number; high: number; low: number; close: number }[];
  meta: ChartMeta;
};

export type MinuteSession = "all" | "j" | "nx";

/** KST 벽시계 기준 N분 봉 시작(timestamp without time zone). 1분이면 date_trunc('minute', …)와 동일 */
function kstMinuteBucketTsSql(col: Prisma.Sql, stepMin: ChartMinuteFrame): Prisma.Sql {
  if (stepMin === 1) {
    return Prisma.sql`date_trunc('minute', ${col} AT TIME ZONE 'Asia/Seoul')`;
  }
  return Prisma.sql`(
    date_trunc('hour', ${col} AT TIME ZONE 'Asia/Seoul')
    + ((floor(EXTRACT(minute FROM (${col} AT TIME ZONE 'Asia/Seoul'))) / ${stepMin})::int * ${stepMin}) * INTERVAL '1 minute'
  )`;
}

function kstNowMinuteBucketTsSql(stepMin: ChartMinuteFrame): Prisma.Sql {
  const nk = Prisma.sql`(NOW() AT TIME ZONE 'Asia/Seoul')`;
  if (stepMin === 1) return Prisma.sql`date_trunc('minute', ${nk})`;
  return Prisma.sql`(
    date_trunc('hour', ${nk})
    + ((floor(EXTRACT(minute FROM ${nk})) / ${stepMin})::int * ${stepMin}) * INTERVAL '1 minute'
  )`;
}

export async function fetchChart(
  prisma: PrismaClient,
  stockCode: string,
  granularity: ChartGranularity,
  range: ChartRange,
  opts?: { limitOverride?: number; minuteSession?: MinuteSession; minuteFrame?: ChartMinuteFrame },
): Promise<ChartBundle> {
  const { from, cap } = windowParams(granularity, range, opts?.limitOverride);
  const minuteSession = opts?.minuteSession ?? "all";
  const minuteFrame: ChartMinuteFrame = granularity === "minute" ? (opts?.minuteFrame ?? 1) : 1;
  const ra = Prisma.sql`"recorded_at"`;
  const bucketRaTs = kstMinuteBucketTsSql(ra, minuteFrame);
  const bucketNowTs = kstNowMinuteBucketTsSql(minuteFrame);
  /** 집계 키·API period: KST 벽시계 → timestamptz (기존 1분봉과 동일 패턴) */
  const periodFromRa = Prisma.sql`(${bucketRaTs} AT TIME ZONE 'Asia/Seoul')`;
  const minuteSessionSql =
    minuteSession === "j"
      ? Prisma.sql`AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '08:00:00') AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time <= TIME '15:30:00')`
      : minuteSession === "nx"
        ? Prisma.sql`AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '15:31:00') AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time <= TIME '20:30:00')`
        : Prisma.sql`AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '08:00:00') AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time <= TIME '20:30:00')`;

  const boundsPromise =
    granularity === "minute"
      ? prisma.$queryRaw<{ min_t: Date | null; max_t: Date | null }[]>`
          SELECT MIN("recorded_at") AS min_t, MAX("recorded_at") AS max_t
          FROM "stock_quote_history"
          WHERE "stock_code" = ${stockCode}
            AND "recorded_at" >= ${from}
            AND ${bucketRaTs} <= ${bucketNowTs}
            ${minuteSessionSql}
        `
      : prisma.$queryRaw<{ min_t: Date | null; max_t: Date | null }[]>`
          SELECT MIN("recorded_at") AS min_t, MAX("recorded_at") AS max_t
          FROM "stock_quote_history"
          WHERE "stock_code" = ${stockCode}
        `;

  const [bounds, rows] = await Promise.all([
    boundsPromise,
    (async (): Promise<OhlcRow[]> => {
      /* 최신 N봉: 안쪽은 시간순 집계 후 ORDER BY period DESC LIMIT → 바깥에서 다시 시간순 */
      switch (granularity) {
        case "minute":
          return prisma.$queryRaw<OhlcRow[]>`
            SELECT * FROM (
              SELECT * FROM (
                SELECT ${periodFromRa} AS period,
                       CAST((array_agg("price" ORDER BY "recorded_at" ASC))[1] AS INT) AS open,
                       CAST(MAX("price") AS INT) AS high,
                       CAST(MIN("price") AS INT) AS low,
                       CAST((array_agg("price" ORDER BY "recorded_at" DESC))[1] AS INT) AS close
                FROM "stock_quote_history"
                WHERE "stock_code" = ${stockCode} AND "recorded_at" >= ${from}
                  AND "price" > 0
                  AND ${bucketRaTs} <= ${bucketNowTs}
                  AND EXTRACT(ISODOW FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) BETWEEN 1 AND 5
                  ${minuteSessionSql}
                  AND NOT (
                    "volume" IS NULL
                    AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time IN (
                      TIME '08:00:00',
                      TIME '08:01:00',
                      TIME '08:02:00',
                      TIME '08:03:00',
                      TIME '09:00:00',
                      TIME '10:00:00',
                      TIME '12:00:00',
                      TIME '15:30:00'
                    ))
                  )
                GROUP BY 1
              ) inner_agg
              ORDER BY period DESC
              LIMIT ${cap}
            ) ordered
            ORDER BY period ASC
          `;
        case "day":
          return prisma.$queryRaw<OhlcRow[]>`
            SELECT * FROM (
              SELECT * FROM (
                SELECT (date_trunc('day', "recorded_at" AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS period,
                       CAST((array_agg("price" ORDER BY "recorded_at" ASC))[1] AS INT) AS open,
                       CAST(MAX("price") AS INT) AS high,
                       CAST(MIN("price") AS INT) AS low,
                       CAST((array_agg("price" ORDER BY "recorded_at" DESC))[1] AS INT) AS close
                FROM "stock_quote_history"
                WHERE "stock_code" = ${stockCode} AND "recorded_at" >= ${from}
                  AND "price" > 0
                GROUP BY 1
              ) inner_agg
              ORDER BY period DESC
              LIMIT ${cap}
            ) ordered
            ORDER BY period ASC
          `;
        case "month":
          return prisma.$queryRaw<OhlcRow[]>`
            SELECT * FROM (
              SELECT * FROM (
                SELECT (date_trunc('month', "recorded_at" AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS period,
                       CAST((array_agg("price" ORDER BY "recorded_at" ASC))[1] AS INT) AS open,
                       CAST(MAX("price") AS INT) AS high,
                       CAST(MIN("price") AS INT) AS low,
                       CAST((array_agg("price" ORDER BY "recorded_at" DESC))[1] AS INT) AS close
                FROM "stock_quote_history"
                WHERE "stock_code" = ${stockCode} AND "recorded_at" >= ${from}
                  AND "price" > 0
                GROUP BY 1
              ) inner_agg
              ORDER BY period DESC
              LIMIT ${cap}
            ) ordered
            ORDER BY period ASC
          `;
        case "year":
          return prisma.$queryRaw<OhlcRow[]>`
            SELECT * FROM (
              SELECT * FROM (
                SELECT (date_trunc('year', "recorded_at" AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS period,
                       CAST((array_agg("price" ORDER BY "recorded_at" ASC))[1] AS INT) AS open,
                       CAST(MAX("price") AS INT) AS high,
                       CAST(MIN("price") AS INT) AS low,
                       CAST((array_agg("price" ORDER BY "recorded_at" DESC))[1] AS INT) AS close
                FROM "stock_quote_history"
                WHERE "stock_code" = ${stockCode} AND "recorded_at" >= ${from}
                  AND "price" > 0
                GROUP BY 1
              ) inner_agg
              ORDER BY period DESC
              LIMIT ${cap}
            ) ordered
            ORDER BY period ASC
          `;
      }
    })(),
  ]);

  const candles = mapOhlcRows(rows);
  const b0 = bounds[0];
  const historyFirstAt = b0?.min_t?.toISOString() ?? null;
  const historyLastAt = b0?.max_t?.toISOString() ?? null;

  let hintKo: string | null = null;
  if (granularity === "minute") {
    if (candles.length === 0) {
      hintKo =
        "분봉은 장중에 수집된 데이터만 표시됩니다. KIS 당일분봉 자동보강은 가능하지만, 과거 일자의 분봉은 API 제한으로 제공되지 않을 수 있습니다.";
    } else if (candles.length < Math.max(120, Math.floor(cap * 0.4))) {
      hintKo =
        "분봉은 KIS 정책상 당일 중심으로만 보강됩니다. 그래서 「최대」를 선택해도 실제 표시 개수는 적을 수 있습니다.";
    }
  } else if (candles.length > 0 && historyFirstAt && historyLastAt) {
    const spanMs = new Date(historyLastAt).getTime() - new Date(historyFirstAt).getTime();
    const windowMs = Date.now() - from.getTime();
    if (spanMs < windowMs * 0.9) {
      hintKo =
        "DB에 쌓인 시세 기간이 조회 범위보다 짧으면, 봉 개수를 늘려도 같은 그래프로 보일 수 있습니다. 분봉은 수집이 촘촘할수록 차이가 납니다.";
    }
  } else if (candles.length === 0 && historyFirstAt) {
    hintKo = "선택한 구간에 데이터가 없습니다. 봉 단위·최근 봉 개수를 바꿔 보세요.";
  }

  return {
    candles,
    meta: {
      windowFrom: from.toISOString(),
      windowLabelKo: describeChartWindow(granularity, range),
      limitCap: cap,
      barCount: candles.length,
      historyFirstAt,
      historyLastAt,
      hintKo,
      ...(granularity === "minute" ? { minuteFrame } : {}),
    },
  };
}

export function createQuoteHistoryRecorder(prisma: PrismaClient, opts: { throttleMs: number }) {
  const lastByCode = new Map<string, number>();
  const lastPointByCode = new Map<string, { price: number; volume: number | null }>();
  const MAX_TICK_JUMP_RATIO = 0.25;

  return {
    record(quotes: QuoteSnapshot[]): void {
      const now = Date.now();
      const throttle = Math.max(1_000, Math.min(60_000, opts.throttleMs));
      const rows: { id: string; stockCode: string; recordedAt: Date; price: number; volume: bigint | null }[] =
        [];
      for (const q of quotes) {
        // 정규장(OPEN) + 프리마켓(PRE, KST 7:30~9:00)만 저장. KIS는 PRE 동안에도 호가가 나옴.
        if (q.marketSession !== "OPEN" && q.marketSession !== "PRE") continue;
        if (!Number.isFinite(q.price) || q.price <= 0) continue;
        const code = q.symbol;
        const last = lastByCode.get(code) ?? 0;
        if (now - last < throttle) continue;
        const volNum = Number.isFinite(q.volume) ? Math.max(0, Math.floor(q.volume)) : null;
        const prev = lastPointByCode.get(code);
        if (prev && prev.price > 0) {
          // 단일 이상치 틱(가짜 급락/급등)이 분봉 저가·고가를 왜곡하지 않도록 저장 전 차단
          const jumpRatio = Math.abs(Math.round(q.price) - prev.price) / prev.price;
          if (jumpRatio > MAX_TICK_JUMP_RATIO) continue;
        }
        if (prev && prev.price === Math.round(q.price) && prev.volume === volNum) continue;
        lastByCode.set(code, now);
        lastPointByCode.set(code, { price: Math.round(q.price), volume: volNum });
        const vol = volNum == null ? null : BigInt(volNum);
        rows.push({
          id: randomUUID(),
          stockCode: code,
          recordedAt: new Date(),
          price: Math.round(q.price),
          volume: vol,
        });
      }
      if (rows.length === 0) return;
      void prisma.stockQuoteHistory
        .createMany({ data: rows })
        .catch(() => {
          /* 로컬 DB 없음 등 — 시세만 계속 */
        });
    },
  };
}
