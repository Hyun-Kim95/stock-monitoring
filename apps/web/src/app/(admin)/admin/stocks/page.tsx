"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type Stock = {
  id: string;
  code: string;
  name: string;
  industryMajorCode: string | null;
  industryMajorName: string | null;
  searchAlias: string | null;
  isActive: boolean;
  nxEligible?: boolean | null;
  themes: { id: string; name: string }[];
};
type StockSearchItem = {
  code: string;
  name: string;
  market: string | null;
  themeNames: string[];
  industryMajorCode: string | null;
  industryMajorName: string | null;
};
type ThemeBrief = { id: string; name: string };

export default function AdminStocksPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [themes, setThemes] = useState<ThemeBrief[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [industryMajorCode, setIndustryMajorCode] = useState("");
  const [industryMajorName, setIndustryMajorName] = useState("");
  const [alias, setAlias] = useState("");
  const [themesText, setThemesText] = useState("");
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<StockSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [s, t] = await Promise.all([
        apiGet<{ stocks: Stock[] }>("/stocks"),
        apiGet<{ themes: { id: string; name: string }[] }>("/themes"),
      ]);
      setStocks(s.stocks);
      setThemes(t.themes.map((x) => ({ id: x.id, name: x.name })));
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "로드 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function searchStocks() {
    const q = searchQuery.trim();
    if (!q) {
      setSearchItems([]);
      return;
    }
    setSearching(true);
    try {
      const data = await apiGet<{ items: StockSearchItem[] }>(`/stocks/search?q=${encodeURIComponent(q)}&size=20`);
      setSearchItems(data.items);
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "종목 검색 실패");
    } finally {
      setSearching(false);
    }
  }

  function selectSearchItem(item: StockSearchItem) {
    setCode(item.code);
    setName(item.name);
    setIndustryMajorCode(item.industryMajorCode ?? "");
    setIndustryMajorName(item.industryMajorName ?? "");
    const byName = new Map(themes.map((t) => [t.name.toLowerCase(), t.id]));
    const nextSelected = new Set<string>();
    for (const tn of item.themeNames) {
      const id = byName.get(tn.toLowerCase());
      if (id) nextSelected.add(id);
    }
    setSelectedThemeIds(nextSelected);
    // 사용자가 "테마 입력"에서도 바로 확인할 수 있게 전체를 채운다.
    setThemesText(item.themeNames.join(", "));
  }

  function selectExistingStock(s: Stock) {
    setCode(s.code);
    setName(s.name);
    setIndustryMajorCode(s.industryMajorCode ?? "");
    setIndustryMajorName(s.industryMajorName ?? "");
    setAlias(s.searchAlias ?? "");
    setThemesText("");
    setSelectedThemeIds(new Set(s.themes.map((t) => t.id)));
  }

  function toggleTheme(id: string) {
    setSelectedThemeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createStock(e: React.FormEvent) {
    e.preventDefault();
    try {
      const newThemeNames = themesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const existingThemeNames = themes
        .filter((t) => selectedThemeIds.has(t.id))
        .map((t) => t.name);
      const themeNames = [...existingThemeNames, ...newThemeNames];
      await apiSend("/stocks", "POST", {
        code,
        name,
        industryMajorCode: industryMajorCode || null,
        searchAlias: alias || null,
        isActive: true,
        themeNames,
      });
      setCode("");
      setName("");
      setIndustryMajorCode("");
      setIndustryMajorName("");
      setAlias("");
      setThemesText("");
      setSelectedThemeIds(new Set());
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "생성 실패");
    }
  }

  async function deactivate(id: string) {
    try {
      await apiSend(`/stocks/${id}`, "DELETE");
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "비활성화 실패");
    }
  }

  return (
    <div>
      {err ? <p style={{ color: "var(--down)" }}>{err}</p> : null}

      <div className="admin-grid">
        <form className="panel" onSubmit={createStock} style={{ padding: 12 }}>
          <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
            종목 추가
          </div>
          <div className="form-row">
            <label>종목명 검색</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchStocks();
                  }
                }}
                placeholder="예: sk이터닉스"
              />
              <button type="button" onClick={() => void searchStocks()}>
                검색
              </button>
            </div>
          </div>
          {searching ? <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>검색 중…</div> : null}
          {searchItems.length > 0 ? (
            <div style={{ marginBottom: 10, border: "1px solid var(--border)", borderRadius: 6, maxHeight: 220, overflow: "auto" }}>
              {searchItems.map((it) => (
                <button
                  key={`${it.code}-${it.name}`}
                  type="button"
                  onClick={() => selectSearchItem(it)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    borderRadius: 0,
                    background: "transparent",
                    padding: "8px 10px",
                  }}
                >
                  <strong>{it.name}</strong> ({it.code}){it.market ? ` · ${it.market}` : ""}
                  {it.industryMajorName ? (
                    <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--muted-foreground)" }}>
                      산업대분류: {it.industryMajorName}
                    </span>
                  ) : null}
                  {it.themeNames.length > 0 ? (
                    <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--muted-foreground)" }}>
                      테마: {it.themeNames.join(", ")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="form-row">
            <label>종목코드</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>종목명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>업종(산업대분류)</label>
            <input value={industryMajorName} readOnly placeholder="종목 검색 후 자동 입력" />
            {industryMajorCode ? (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted-foreground)" }}>
                내부 코드: {industryMajorCode}
              </div>
            ) : null}
          </div>
          <div className="form-row">
            <label>검색 별칭 (쉼표 구분)</label>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div className="form-row">
            <label>테마 (쉼표 구분)</label>
            <input
              value={themesText}
              onChange={(e) => setThemesText(e.target.value)}
              placeholder="새 테마 추가: 예) 반도체, 2차전지"
            />
          </div>
          <div className="form-row">
            <label>기존 테마 선택</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {themes.map((t) => {
                const on = selectedThemeIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTheme(t.id)}
                    className={on ? "primary" : "btn btn-secondary"}
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    title={on ? "선택됨" : "선택"}
                  >
                    {t.name}
                  </button>
                );
              })}
              {themes.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>등록된 테마가 없습니다.</span>
              ) : null}
            </div>
          </div>
          <button type="submit" className="primary">
            등록
          </button>
        </form>

        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-h">활성 종목</div>
          <div className="panel-b">
            <table className="data-table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>이름</th>
                  <th>별칭</th>
                  <th>산업대분류</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => selectExistingStock(s)}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{s.searchAlias ?? "—"}</td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: 12 }} title={s.industryMajorCode ?? undefined}>
                      {s.industryMajorName ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deactivate(s.id);
                        }}
                      >
                        비활성
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
