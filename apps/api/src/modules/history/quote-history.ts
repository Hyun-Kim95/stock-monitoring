import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { QuoteSnapshot } from "@stock-monitoring/shared";
import {
  CHART_RANGE_MATRIX,
  formatChartRangeDescription,
  type ChartGranularity,
  type ChartRange,
} from "@stock-monitoring/shared";

export type { ChartGranularity, ChartRange };

function windowParams(granularity: ChartGranularity, range: ChartRange): { from: Date; cap: number } {
  const { barCap, lookbackMs } = CHART_RANGE_MATRIX[granularity][range];
  return {
    from: new Date(Date.now() - lookbackMs),
    cap: Math.min(20_000, Math.max(10, barCap)),
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
};

export type ChartBundle = {
  candles: { t: string; open: number; high: number; low: number; close: number }[];
  meta: ChartMeta;
};

export async function fetchChart(
  prisma: PrismaClient,
  stockCode: string,
  granularity: ChartGranularity,
  range: ChartRange,
): Promise<ChartBundle> {
  const { from, cap } = windowParams(granularity, range);

  const [bounds, rows] = await Promise.all([
    prisma.$queryRaw<{ min_t: Date | null; max_t: Date | null }[]>`
      SELECT MIN("recorded_at") AS min_t, MAX("recorded_at") AS max_t
      FROM "stock_quote_history"
      WHERE "stock_code" = ${stockCode}
    `,
    (async (): Promise<OhlcRow[]> => {
      /* 최신 N봉: 안쪽은 시간순 집계 후 ORDER BY period DESC LIMIT → 바깥에서 다시 시간순 */
      switch (granularity) {
        case "minute":
          return prisma.$queryRaw<OhlcRow[]>`
            SELECT * FROM (
              SELECT * FROM (
                SELECT (date_trunc('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS period,
                       CAST((array_agg("price" ORDER BY "recorded_at" ASC))[1] AS INT) AS open,
                       CAST(MAX("price") AS INT) AS high,
                       CAST(MIN("price") AS INT) AS low,
                       CAST((array_agg("price" ORDER BY "recorded_at" DESC))[1] AS INT) AS close
                FROM "stock_quote_history"
                WHERE "stock_code" = ${stockCode} AND "recorded_at" >= ${from}
                  AND "price" > 0
                  AND EXTRACT(ISODOW FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) BETWEEN 1 AND 5
                  AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '09:00:00')
                  AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time <= TIME '15:30:00')
                  AND NOT (
                    EXTRACT(SECOND FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 0
                    AND (
                      (EXTRACT(HOUR FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 9 AND EXTRACT(MINUTE FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 0)
                      OR (EXTRACT(HOUR FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 10 AND EXTRACT(MINUTE FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 0)
                      OR (EXTRACT(HOUR FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 12 AND EXTRACT(MINUTE FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 0)
                      OR (EXTRACT(HOUR FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 15 AND EXTRACT(MINUTE FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) = 30)
                    )
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
    },
  };
}

export function createQuoteHistoryRecorder(prisma: PrismaClient, opts: { throttleMs: number }) {
  const lastByCode = new Map<string, number>();
  const lastPointByCode = new Map<string, { price: number; volume: number | null }>();

  return {
    record(quotes: QuoteSnapshot[]): void {
      const now = Date.now();
      const throttle = Math.max(5_000, opts.throttleMs);
      const rows: { id: string; stockCode: string; recordedAt: Date; price: number; volume: bigint | null }[] =
        [];
      for (const q of quotes) {
        // 거래 가능 시간(OPEN)만 히스토리에 저장. 장 종료 후 동일 가격 연속 적재 방지.
        if (q.marketSession !== "OPEN") continue;
        if (!Number.isFinite(q.price) || q.price <= 0) continue;
        const code = q.symbol;
        const last = lastByCode.get(code) ?? 0;
        if (now - last < throttle) continue;
        const volNum = Number.isFinite(q.volume) ? Math.max(0, Math.floor(q.volume)) : null;
        const prev = lastPointByCode.get(code);
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
