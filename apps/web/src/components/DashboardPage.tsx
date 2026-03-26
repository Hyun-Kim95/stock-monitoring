"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet } from "@/lib/api-client";
import { formatQuotePrice } from "@/lib/format-quote";
import { useQuotesWebSocket } from "@/hooks/useQuotesWebSocket";
import { PriceChartPanel } from "@/components/PriceChartPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { QuoteSnapshot } from "@stock-monitoring/shared";

type ThemeBrief = { id: string; name: string };

type StockApi = {
  id: string;
  code: string;
  name: string;
  industryMajorCode: string | null;
  industryMajorName: string | null;
  searchAlias: string | null;
  themes: ThemeBrief[];
};

type NewsItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
};

type SortKey = "name" | "price" | "changeRate" | "volume";

function formatForeignNetVol(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("ko-KR")}`;
}

function formatForeignPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(3)}%`;
}

export function DashboardPage() {
  const { quotes, connected, statusMsg, statusLoading } = useQuotesWebSocket();
  const [stocks, setStocks] = useState<StockApi[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 비어 있으면 테마 필터 없음. 값이 있으면 해당 테마 중 하나라도 있는 종목만 표시(OR). */
  const [themeFilterIds, setThemeFilterIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("changeRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterText, setFilterText] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [stocksLoading, setStocksLoading] = useState(true);

  const refreshStocks = useCallback(async () => {
    setStocksLoading(true);
    try {
      setLoadErr(null);
      const data = await apiGet<{ stocks: StockApi[] }>("/stocks");
      setStocks(data.stocks);
    } catch {
      setLoadErr("종목 목록을 불러오지 못했습니다. API 서버를 확인하세요.");
    } finally {
      setStocksLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStocks();
  }, [refreshStocks]);

  const selected = stocks.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const s = stocks.find((x) => x.id === selectedId);
    if (!s) {
      setSelectedId(null);
      return;
    }
    const q = filterText.trim().toLowerCase();
    if (themeFilterIds.length > 0 && !s.themes.some((t) => themeFilterIds.includes(t.id))) {
      setSelectedId(null);
      return;
    }
    if (
      q &&
      !s.code.toLowerCase().includes(q) &&
      !s.name.toLowerCase().includes(q) &&
      !(s.searchAlias?.toLowerCase().includes(q) ?? false)
    ) {
      setSelectedId(null);
    }
  }, [selectedId, stocks, themeFilterIds, filterText]);

  const portfolioThemes = useMemo(() => {
    const m = new Map<string, ThemeBrief>();
    for (const s of stocks) {
      for (const t of s.themes) {
        if (!m.has(t.id)) m.set(t.id, t);
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [stocks]);

  function toggleThemeFilter(themeId: string) {
    setThemeFilterIds((prev) =>
      prev.includes(themeId) ? prev.filter((id) => id !== themeId) : [...prev, themeId],
    );
  }

  useEffect(() => {
    if (!selectedId) {
      setNews([]);
      return;
    }
    let cancelled = false;
    setNewsErr(null);
    apiGet<{ news: NewsItem[] }>(`/stocks/${selectedId}/news`)
      .then((d) => {
        if (!cancelled) {
          setNews(d.news);
          setNewsErr(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setNews([]);
        if (e instanceof ApiError) {
          const body = e.body as { error?: { code?: string; message?: string } } | null;
          const msg = body?.error?.message;
          setNewsErr(msg ?? e.message ?? "뉴스를 불러오지 못했습니다.");
        } else {
          setNewsErr("뉴스를 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const rows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    let list = stocks.filter((s) => {
      if (themeFilterIds.length > 0) {
        if (!s.themes.some((t) => themeFilterIds.includes(t.id))) return false;
      }
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.searchAlias?.toLowerCase().includes(q) ?? false)
      );
    });

    const getQuote = (code: string): QuoteSnapshot | undefined => quotes.get(code);

    list = [...list].sort((a, b) => {
      const qa = getQuote(a.code);
      const qb = getQuote(b.code);
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, "ko") * dir;
      }
      if (sortKey === "price") {
        const pa = qa?.price ?? -Infinity;
        const pb = qb?.price ?? -Infinity;
        return pa === pb ? 0 : pa < pb ? -dir : dir;
      }
      if (sortKey === "changeRate") {
        const ra = qa?.changeRate ?? -Infinity;
        const rb = qb?.changeRate ?? -Infinity;
        return ra === rb ? 0 : ra < rb ? -dir : dir;
      }
      const va = qa?.volume ?? -Infinity;
      const vb = qb?.volume ?? -Infinity;
      return va === vb ? 0 : va < vb ? -dir : dir;
    });

    return list;
  }, [stocks, filterText, themeFilterIds, sortKey, sortDir, quotes]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 700 }}>관심종목 모니터링</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="badge">{connected ? "WS 연결됨" : "WS 재연결 중"}</span>
          {statusMsg ? <span className="badge">{statusMsg}</span> : null}
          <input
            placeholder="종목명·코드·별칭 필터"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <ThemeToggle />
          <Link href="/admin/stocks">관리자</Link>
        </div>
      </header>

      {loadErr ? (
        <div style={{ padding: 12, color: "var(--down)" }}>{loadErr}</div>
      ) : null}

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(560px,1fr) minmax(220px,0.35fr) minmax(280px,0.5fr)",
          gap: 8,
          padding: 8,
          minHeight: 0,
        }}
      >
        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">관심종목</div>
          <div className="panel-b" style={{ flex: 1, overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="num" style={{ cursor: "pointer" }} onClick={() => toggleSort("price")}>
                    현재가 {sortKey === "price" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="num" style={{ cursor: "pointer" }} onClick={() => toggleSort("changeRate")}>
                    등락률 {sortKey === "changeRate" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="num" style={{ cursor: "pointer" }} onClick={() => toggleSort("volume")}>
                    거래량 {sortKey === "volume" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="num" title="당일 외국인 순매수 수량(주). KIS 현재가 API 기준">
                    외인순매수
                  </th>
                  <th className="num" title="외국인 소진율(%)">
                    외인%
                  </th>
                  <th>세션</th>
                </tr>
              </thead>
              <tbody>
                {stocksLoading && stocks.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span className="loading-dot" aria-hidden />
                        종목 목록을 불러오는 중…
                      </span>
                    </td>
                  </tr>
                ) : null}
                {rows.map((s) => {
                  const q = quotes.get(s.code);
                  const sel = s.id === selectedId;
                  const cr = q?.changeRate ?? null;
                  const crCls = cr === null ? "" : cr > 0 ? "up" : cr < 0 ? "down" : "";
                  const fn = q?.foreignNetBuyVolume ?? null;
                  const fnCls = fn === null ? "" : fn > 0 ? "up" : fn < 0 ? "down" : "";
                  return (
                    <tr
                      key={s.id}
                      className={sel ? "selected" : undefined}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>{s.code}</div>
                      </td>
                      <td className="num">{q ? formatQuotePrice(q) : "—"}</td>
                      <td className={`num ${crCls}`}>
                        {q ? `${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(2)}%` : "—"}
                      </td>
                      <td className="num">{q ? q.volume.toLocaleString("ko-KR") : "—"}</td>
                      <td className={`num ${fnCls}`}>{q ? formatForeignNetVol(q.foreignNetBuyVolume) : "—"}</td>
                      <td className="num">{q ? formatForeignPct(q.foreignOwnershipPct) : "—"}</td>
                      <td>{q?.marketSession ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selected ? (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: 12,
                flexShrink: 0,
                minHeight: 240,
                background: "var(--background)",
              }}
            >
              <PriceChartPanel
                stockId={selected.id}
                stockName={selected.name}
                stockCode={selected.code}
                industryMajorName={selected.industryMajorName}
                liveQuote={quotes.get(selected.code)}
              />
            </div>
          ) : (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: 12,
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            >
              종목을 선택하면 가격 추이 차트(분·일·월·년)가 표시됩니다.
            </div>
          )}
        </div>

        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">테마</div>
          <div className="panel-b" style={{ flex: 1 }}>
            <div style={{ marginBottom: 10, color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.4 }}>
              관심종목에 연결된 테마입니다. 클릭하면 왼쪽 목록에{" "}
              <strong style={{ color: "var(--text)" }}>포함(OR)</strong>·다시 클릭하면 조건에서 뺍니다.
            </div>
            {portfolioThemes.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)" }}>표시할 테마가 없습니다. 종목에 테마를 연결하세요.</div>
            ) : (
              <>
                {portfolioThemes.map((t) => {
                  const on = themeFilterIds.includes(t.id);
                  return (
                    <div key={t.id} style={{ marginBottom: 6 }}>
                      <button
                        type="button"
                        onClick={() => toggleThemeFilter(t.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: on ? "rgba(88,166,255,0.22)" : undefined,
                          border: on ? "1px solid rgba(88,166,255,0.45)" : "1px solid transparent",
                        }}
                      >
                        {t.name}
                        {on ? " · 필터 적용" : ""}
                      </button>
                    </div>
                  );
                })}
                {themeFilterIds.length > 0 ? (
                  <button type="button" style={{ marginTop: 10 }} onClick={() => setThemeFilterIds([])}>
                    테마 필터 전체 해제
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">관련 뉴스</div>
          <div style={{ padding: "0 12px 6px", fontSize: 11, color: "var(--muted-foreground)" }}>
            최근 약 3개월(90일) 이내 기사만 표시합니다.
            {selected ? (
              <>
                {" "}
                · 선택: <strong style={{ color: "var(--text)" }}>{selected.name}</strong>
              </>
            ) : null}
          </div>
          <div className="panel-b" style={{ flex: 1 }}>
            {!selectedId ? (
              <div style={{ color: "var(--muted-foreground)" }}>종목을 선택하세요.</div>
            ) : newsErr ? (
              <div style={{ color: "var(--down)" }}>{newsErr}</div>
            ) : news.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)" }}>표시할 뉴스가 없습니다.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {news.map((n) => (
                  <li key={n.id} style={{ marginBottom: 10 }}>
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>
                    <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                      {n.source} · {new Date(n.publishedAt).toLocaleString("ko-KR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
