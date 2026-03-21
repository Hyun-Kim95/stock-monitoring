"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { useQuotesWebSocket } from "@/hooks/useQuotesWebSocket";
import type { QuoteSnapshot } from "@stock-monitoring/shared";

type ThemeBrief = { id: string; name: string };

type StockApi = {
  id: string;
  code: string;
  name: string;
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

export function DashboardPage() {
  const { quotes, connected, statusMsg } = useQuotesWebSocket();
  const [stocks, setStocks] = useState<StockApi[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("changeRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterText, setFilterText] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refreshStocks = useCallback(async () => {
    try {
      setLoadErr(null);
      const data = await apiGet<{ stocks: StockApi[] }>("/stocks");
      setStocks(data.stocks);
    } catch {
      setLoadErr("종목 목록을 불러오지 못했습니다. API 서버를 확인하세요.");
    }
  }, []);

  useEffect(() => {
    void refreshStocks();
  }, [refreshStocks]);

  const selected = stocks.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      setNews([]);
      return;
    }
    let cancelled = false;
    setNewsErr(null);
    apiGet<{ news: NewsItem[] }>(`/stocks/${selectedId}/news`)
      .then((d) => {
        if (!cancelled) setNews(d.news);
      })
      .catch(() => {
        if (!cancelled) setNewsErr("뉴스를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const rows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    let list = stocks.filter((s) => {
      if (themeFilter) {
        if (!s.themes.some((t) => t.id === themeFilter)) return false;
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
  }, [stocks, filterText, themeFilter, sortKey, sortDir, quotes]);

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
          gridTemplateColumns: "minmax(380px,1fr) minmax(220px,0.35fr) minmax(280px,0.5fr)",
          gap: 8,
          padding: 8,
          minHeight: 0,
        }}
      >
        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">관심종목</div>
          <div className="panel-b" style={{ flex: 1 }}>
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
                  <th>세션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const q = quotes.get(s.code);
                  const sel = s.id === selectedId;
                  const cr = q?.changeRate ?? null;
                  const crCls = cr === null ? "" : cr > 0 ? "up" : cr < 0 ? "down" : "";
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
                      <td className="num">{q ? q.price.toLocaleString("ko-KR") : "—"}</td>
                      <td className={`num ${crCls}`}>
                        {q ? `${q.changeRate >= 0 ? "+" : ""}${q.changeRate.toFixed(2)}%` : "—"}
                      </td>
                      <td className="num">{q ? q.volume.toLocaleString("ko-KR") : "—"}</td>
                      <td>{q?.marketSession ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">테마</div>
          <div className="panel-b" style={{ flex: 1 }}>
            {!selected ? (
              <div style={{ color: "var(--muted-foreground)" }}>종목을 선택하세요.</div>
            ) : (
              <>
                <div style={{ marginBottom: 8, color: "var(--muted-foreground)", fontSize: 12 }}>
                  선택: <strong style={{ color: "var(--text)" }}>{selected.name}</strong>
                </div>
                {selected.themes.length === 0 ? (
                  <div style={{ color: "var(--muted-foreground)" }}>연결된 테마 없음</div>
                ) : (
                  selected.themes.map((t) => (
                    <div key={t.id} style={{ marginBottom: 6 }}>
                      <button
                        type="button"
                        onClick={() => setThemeFilter((f) => (f === t.id ? null : t.id))}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: themeFilter === t.id ? "rgba(88,166,255,0.2)" : undefined,
                        }}
                      >
                        {t.name}
                        {themeFilter === t.id ? " ✓" : ""}
                      </button>
                    </div>
                  ))
                )}
                {themeFilter ? (
                  <button type="button" style={{ marginTop: 8 }} onClick={() => setThemeFilter(null)}>
                    테마 필터 해제
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-h">관련 뉴스 (목데이터)</div>
          <div className="panel-b" style={{ flex: 1 }}>
            {!selectedId ? (
              <div style={{ color: "var(--muted-foreground)" }}>종목을 선택하세요.</div>
            ) : newsErr ? (
              <div style={{ color: "var(--down)" }}>{newsErr}</div>
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
