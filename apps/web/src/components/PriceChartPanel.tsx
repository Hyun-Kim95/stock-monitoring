"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { chartRangeButtonLabel } from "@sm-shared/chart-range";
import type { QuoteSnapshot } from "@stock-monitoring/shared";
import { ApiError, apiGet } from "@/lib/api-client";
import { formatQuotePrice } from "@/lib/format-quote";

type Granularity = "minute" | "day" | "month" | "year";
type RangeKey = "compact" | "normal" | "deep" | "max";

type ChartMeta = {
  windowFrom: string;
  windowLabelKo: string;
  limitCap: number;
  barCount: number;
  historyFirstAt: string | null;
  historyLastAt: string | null;
  hintKo: string | null;
};

type ChartApi = {
  stockId: string;
  granularity: Granularity;
  range: RangeKey;
  candles: { t: string; open: number; high: number; low: number; close: number }[];
  name: string;
  code: string;
  meta: ChartMeta;
};

const GRAN_LABELS: Record<Granularity, string> = {
  minute: "분",
  day: "일",
  month: "월",
  year: "년",
};

function toLwCandles(rows: ChartApi["candles"]): CandlestickData<UTCTimestamp>[] {
  return rows.map((r) => ({
    time: Math.floor(new Date(r.t).getTime() / 1000) as UTCTimestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
  }));
}

/** 현재 시각의 KST 분 시작(초 단위 UTC epoch) — 서버 분봉 집계와 동일한 버킷 */
function kstMinuteStartUtcSec(now = new Date()): UTCTimestamp {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "0";
  const y = pick("year");
  const mo = pick("month");
  const d = pick("day");
  const h = pick("hour");
  const m = pick("minute");
  const iso = `${y}-${mo}-${d}T${h}:${m}:00+09:00`;
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

/** 봉 시각(초)을 KST 분 시작 epoch으로 맞춤 — DB period와 클라이언트 now의 초 단위 차이로 === 비교가 깨지는 것 방지 */
function minuteBucketUtcSec(barTimeSec: number): UTCTimestamp {
  return kstMinuteStartUtcSec(new Date(barTimeSec * 1000));
}

/** WebSocket 시세로 막대기 형성 중인 분봉을 실시간 반영 (DB는 1초 단위 저장) */
function mergeLiveMinuteBar(
  candles: CandlestickData<UTCTimestamp>[],
  quote: QuoteSnapshot | undefined,
  stockCode: string,
): CandlestickData<UTCTimestamp>[] {
  if (!quote || quote.symbol !== stockCode) return candles;
  const p = Math.round(quote.price);
  if (!Number.isFinite(p) || p <= 0) return candles;

  const nowBucket = kstMinuteStartUtcSec();
  if (candles.length === 0) {
    if (quote.marketSession !== "OPEN" && quote.marketSession !== "PRE") return candles;
    return [{ time: nowBucket, open: p, high: p, low: p, close: p }];
  }

  const out = candles.map((c) => ({ ...c }));
  const last = out[out.length - 1];
  const lastTs = Number(last.time);
  const lastBucket = minuteBucketUtcSec(lastTs);

  if (lastBucket === nowBucket) {
    out[out.length - 1] = {
      time: lastBucket,
      open: last.open,
      high: Math.max(last.high, p),
      low: Math.min(last.low, p),
      close: p,
    };
    return out;
  }

  if (lastBucket < nowBucket) {
    if (quote.marketSession !== "OPEN" && quote.marketSession !== "PRE") return candles;
    out.push({
      time: nowBucket,
      open: last.close,
      high: Math.max(last.close, p),
      low: Math.min(last.close, p),
      close: p,
    });
    return out;
  }

  /* 서버 봉 시각이 클라이언트 ‘현재 분’보다 앞서 보이는 경우(시계·파싱 차이): 마지막 봉만 WS로 맞춤 */
  out[out.length - 1] = {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, p),
    low: Math.min(last.low, p),
    close: p,
  };
  return out;
}

function kstYmdParts(d: Date): { y: string; m: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (tp: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === tp)?.value ?? "";
  return { y: pick("year"), m: pick("month"), day: pick("day") };
}

/** 마지막 봉이 KST 기준 ‘현재 일·월·년’ 구간이면 WS 현재가로 종·고·저 보정 (일봉 기본 화면과 테이블 불일치 방지) */
function mergeLiveIntoAggregatedLastBar(
  candles: CandlestickData<UTCTimestamp>[],
  quote: QuoteSnapshot | undefined,
  stockCode: string,
  granularity: Granularity,
): CandlestickData<UTCTimestamp>[] {
  if (granularity === "minute" || !quote || quote.symbol !== stockCode) return candles;
  const p = Math.round(quote.price);
  if (!Number.isFinite(p) || p <= 0 || candles.length === 0) return candles;

  const last = candles[candles.length - 1];
  const lastDate = new Date((last.time as number) * 1000);
  const now = new Date();
  const cur = kstYmdParts(now);
  const k = kstYmdParts(lastDate);

  let inCurrentPeriod = false;
  if (granularity === "day") {
    inCurrentPeriod = k.y === cur.y && k.m === cur.m && k.day === cur.day;
  } else if (granularity === "month") {
    inCurrentPeriod = k.y === cur.y && k.m === cur.m;
  } else if (granularity === "year") {
    inCurrentPeriod = k.y === cur.y;
  }

  if (!inCurrentPeriod) return candles;

  const out = candles.map((c) => ({ ...c }));
  const prev = out[out.length - 1];
  out[out.length - 1] = {
    ...prev,
    close: p,
    high: Math.max(prev.high, p),
    low: Math.min(prev.low, p),
  };
  return out;
}

const KST: Intl.DateTimeFormatOptions = { timeZone: "Asia/Seoul" };

function kstCalendarYear(d: Date): number {
  const y = new Intl.DateTimeFormat("en-CA", { ...KST, year: "numeric" }).formatToParts(d).find((p) => p.type === "year")
    ?.value;
  return y ? Number(y) : d.getUTCFullYear();
}

function timeToDate(t: Time): Date | null {
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof t === "object" && t !== null && "year" in t) {
    const b = t as { year: number; month: number; day: number };
    return new Date(Date.UTC(b.year, b.month - 1, b.day));
  }
  return null;
}

/** 크로스헤어·하단 보조 문구용 (길이 제한 없음) */
function formatCrosshairLabel(t: Time, granularity: Granularity): string {
  const d = timeToDate(t);
  if (!d) return "";
  const base: Intl.DateTimeFormatOptions = { ...KST, hour12: false };
  if (granularity === "minute") {
    return d.toLocaleString("ko-KR", {
      ...base,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (granularity === "day") {
    return d.toLocaleString("ko-KR", { ...base, year: "numeric", month: "long", day: "numeric" });
  }
  if (granularity === "month") {
    return d.toLocaleString("ko-KR", { ...base, year: "numeric", month: "long" });
  }
  return d.toLocaleString("ko-KR", { ...base, year: "numeric" });
}

/**
 * 시간축 눈금 — 라이브러리 권장 8자 이내.
 * @see lightweight-charts TickMarkFormatter
 */
function formatTickMarkLabel(
  time: Time,
  tickMarkType: number,
  granularity: Granularity,
  TickMarkType: { Year: number; Month: number; DayOfMonth: number; Time: number; TimeWithSeconds: number },
): string | null {
  const d = timeToDate(time);
  if (!d) return null;

  if (granularity === "minute") {
    if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
      return d.toLocaleTimeString("ko-KR", { ...KST, hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (tickMarkType === TickMarkType.DayOfMonth) {
      return d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric" });
    }
    if (tickMarkType === TickMarkType.Month) {
      return d.toLocaleDateString("ko-KR", { ...KST, year: "2-digit", month: "numeric" });
    }
    if (tickMarkType === TickMarkType.Year) {
      return `${kstCalendarYear(d)}`;
    }
    return null;
  }

  if (granularity === "day") {
    if (tickMarkType === TickMarkType.Year) return `${kstCalendarYear(d)}`;
    if (tickMarkType === TickMarkType.Month) return d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric" });
    return d.toLocaleDateString("ko-KR", { ...KST, month: "numeric", day: "numeric" });
  }

  if (granularity === "month") {
    if (tickMarkType === TickMarkType.Year) return `${kstCalendarYear(d)}`;
    return d.toLocaleDateString("ko-KR", { ...KST, year: "numeric", month: "numeric" });
  }

  if (granularity === "year") {
    return `${kstCalendarYear(d)}`;
  }
  return null;
}

export function PriceChartPanel({
  stockId,
  stockName,
  stockCode,
  liveQuote,
}: {
  stockId: string;
  stockName: string;
  stockCode?: string;
  liveQuote?: QuoteSnapshot;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [range, setRange] = useState<RangeKey>("normal");
  const [candles, setCandles] = useState<ChartApi["candles"]>([]);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** 크로스헤어가 가리키는 봉(OHLC) — 우측 가격 눈금만 보면 헷갈려서 별도 표시 */
  const [hoverBar, setHoverBar] = useState<{
    timeLabel: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  /** 늦게 도착한 차트 응답이 봉 단위·범위·종목을 덮어쓰지 않도록 */
  const fetchSeqRef = useRef(0);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    const seq = ++fetchSeqRef.current;
    if (!soft) {
      setLoading(true);
      setErr(null);
      setCandles([]);
      setMeta(null);
      setHoverBar(null);
    }
    try {
      const res = await apiGet<ChartApi>(
        `/stocks/${stockId}/chart?granularity=${granularity}&range=${range}`,
      );
      if (seq !== fetchSeqRef.current) return;
      if (res.stockId !== stockId || res.granularity !== granularity || res.range !== range) return;
      setCandles(res.candles);
      setMeta(res.meta);
      if (!soft) setErr(null);
    } catch (e) {
      if (!soft) {
        if (seq !== fetchSeqRef.current) return;
        setCandles([]);
        setMeta(null);
        if (e instanceof ApiError) {
          setErr(`차트 ${e.status}`);
        } else {
          setErr("차트를 불러오지 못했습니다.");
        }
      }
    } finally {
      if (!soft && seq === fetchSeqRef.current) setLoading(false);
    }
  }, [stockId, granularity, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (granularity !== "minute") return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load({ soft: true });
    }, 1_000);
    return () => window.clearInterval(id);
  }, [granularity, load]);

  const lwBase = useMemo(() => toLwCandles(candles), [candles]);
  const lwData = useMemo(() => {
    if (!stockCode) return lwBase;
    let lw = lwBase;
    if (granularity === "minute") {
      lw = mergeLiveMinuteBar(lw, liveQuote, stockCode);
    } else {
      lw = mergeLiveIntoAggregatedLastBar(lw, liveQuote, stockCode, granularity);
    }
    return lw;
  }, [lwBase, granularity, stockCode, liveQuote]);

  /** 종목·봉·범위·서버 캔들 개수가 바뀔 때만 차트 인스턴스를 새로 만듦 (실시간 시세는 아래 effect에서 setData) */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (lwData.length === 0) {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setHoverBar(null);
      return;
    }

    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let unsubCrosshair: (() => void) | null = null;

    void import("lightweight-charts").then((mod) => {
      if (cancelled || !containerRef.current) return;

      chartRef.current?.remove();
      unsubCrosshair?.();
      ro?.disconnect();
      unsubCrosshair = null;
      ro = null;

      const w = Math.max(200, containerRef.current.clientWidth);
      const h = 280;
      const isMinute = granularity === "minute";

      const chart = mod.createChart(containerRef.current, {
        width: w,
        height: h,
        layout: {
          background: { type: mod.ColorType.Solid, color: "transparent" },
          textColor: "rgba(180, 180, 180, 0.95)",
        },
        grid: {
          vertLines: { color: "rgba(128,128,128,0.12)" },
          horzLines: { color: "rgba(128,128,128,0.12)" },
        },
        crosshair: {
          mode: mod.CrosshairMode.Normal,
          vertLine: { labelBackgroundColor: "rgba(60,60,60,0.9)" },
          horzLine: { labelBackgroundColor: "rgba(60,60,60,0.9)" },
        },
        rightPriceScale: { borderColor: "rgba(128,128,128,0.25)" },
        timeScale: {
          borderColor: "rgba(128,128,128,0.25)",
          timeVisible: isMinute,
          secondsVisible: false,
          tickMarkFormatter: (time: Time, tickMarkType: number, _locale: string) =>
            formatTickMarkLabel(time, tickMarkType, granularity, mod.TickMarkType),
        },
        localization: {
          locale: "ko-KR",
          dateFormat: "yyyy/MM/dd",
          priceFormatter: (price: number) => Math.round(price).toLocaleString("ko-KR"),
          timeFormatter: (time: Time) => formatCrosshairLabel(time, granularity),
        },
      });

      const series = chart.addSeries(mod.CandlestickSeries, {
        upColor: "#ef5350",
        downColor: "#2196f3",
        borderVisible: false,
        wickUpColor: "#ef5350",
        wickDownColor: "#2196f3",
        priceFormat: { type: "price", precision: 0, minMove: 1 },
      }) as ISeriesApi<"Candlestick">;
      series.setData(lwData);
      chart.timeScale().fitContent();
      chartRef.current = chart;
      seriesRef.current = series;

      const onCrosshairMove = (param: MouseEventParams) => {
        if (param.point === undefined || param.time === undefined) {
          setHoverBar(null);
          return;
        }
        const bar = param.seriesData.get(series);
        if (!bar || typeof bar !== "object" || !("open" in bar)) {
          setHoverBar(null);
          return;
        }
        const o = bar as { open: number; high: number; low: number; close: number };
        setHoverBar({
          timeLabel: formatCrosshairLabel(param.time, granularity),
          open: o.open,
          high: o.high,
          low: o.low,
          close: o.close,
        });
      };
      chart.subscribeCrosshairMove(onCrosshairMove);
      unsubCrosshair = () => chart.unsubscribeCrosshairMove(onCrosshairMove);

      ro = new ResizeObserver(() => {
        if (!containerRef.current || !chartRef.current) return;
        chartRef.current.applyOptions({ width: Math.max(200, containerRef.current.clientWidth) });
      });
      ro.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      unsubCrosshair?.();
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setHoverBar(null);
    };
  }, [stockId, granularity, range, lwBase.length]);

  useEffect(() => {
    if (lwData.length === 0 || !seriesRef.current) return;
    seriesRef.current.setData(lwData);
  }, [lwData]);

  return (
    <div style={{ minHeight: 200 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>캔들 차트 · {stockName}</span>
          {liveQuote ? (
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              현재가 {formatQuotePrice(liveQuote)}
              <span style={{ fontWeight: 500, color: "var(--muted-foreground)", marginLeft: 8, fontSize: 11 }}>
                (실시간 · 표와 동일)
              </span>
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>봉 단위</span>
          {(Object.keys(GRAN_LABELS) as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              className={granularity === g ? "primary" : "btn btn-secondary"}
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => setGranularity(g)}
            >
              {GRAN_LABELS[g]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>최근 봉 개수</span>
          {(["compact", "normal", "deep", "max"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? "primary" : "btn btn-secondary"}
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => setRange(r)}
              title={chartRangeButtonLabel(granularity, r)}
            >
              {chartRangeButtonLabel(granularity, r)}
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
        시세는 서버에서 최소 약 1초 간격으로 저장됩니다. <strong>일·월·년</strong> 마지막 봉은 오늘/이번 달/올해에
        해당할 때 WebSocket 현재가로 종가를 맞춥니다. <strong>분</strong> 봉은 같은 분 구간에서 실시간 반영됩니다.
        크로스헤어의 종가는 <strong>해당 봉(히스토리)</strong>의 값입니다. 아래는 <strong>최근부터 최대 N개</strong> 봉이며,
        DB에 쌓인 기간이 짧으면 N보다 적게 보일 수 있습니다.
      </p>
      {meta && !err ? (
        <div
          style={{
            marginBottom: 8,
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.5,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "rgba(128,128,128,0.06)",
          }}
        >
          <div>
            <strong>조회:</strong> {meta.windowLabelKo}{" "}
            <span style={{ color: "var(--muted-foreground)" }}>
              (범위 시작 시각 {new Date(meta.windowFrom).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})
            </span>
            {" · "}
            <strong>봉</strong> {meta.barCount}개
            {meta.limitCap != null ? (
              <span style={{ color: "var(--muted-foreground)" }}> / 요청 상한 {meta.limitCap}개</span>
            ) : null}
            {meta.historyFirstAt && meta.historyLastAt ? (
              <>
                {" · "}
                <strong>수집 범위</strong> {new Date(meta.historyFirstAt).toLocaleString("ko-KR")} ~{" "}
                {new Date(meta.historyLastAt).toLocaleString("ko-KR")}
              </>
            ) : null}
          </div>
          {meta.hintKo ? (
            <div style={{ marginTop: 6, color: "var(--text)" }}>ⓘ {meta.hintKo}</div>
          ) : null}
        </div>
      ) : null}
      {err ? <div style={{ color: "var(--down)", fontSize: 12 }}>{err}</div> : null}
      {loading && lwData.length === 0 ? (
        <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>불러오는 중…</div>
      ) : null}
      {!loading && !err && lwData.length === 0 ? (
        <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          저장된 시세가 없습니다. API가 켜진 채로 잠시 두면 캔들이 채워집니다.
        </div>
      ) : null}
      {lwData.length > 0 ? (
        <>
          <div ref={containerRef} style={{ width: "100%", height: 280, position: "relative" }} />
          {hoverBar ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                lineHeight: 1.55,
                color: "var(--muted-foreground)",
              }}
            >
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{hoverBar.timeLabel}</span>
              {" · "}
              시 {hoverBar.open.toLocaleString("ko-KR")} · 고 {hoverBar.high.toLocaleString("ko-KR")} · 저{" "}
              {hoverBar.low.toLocaleString("ko-KR")} · 종 {hoverBar.close.toLocaleString("ko-KR")}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
