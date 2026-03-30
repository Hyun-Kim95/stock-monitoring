"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type StockBrief = { id: string; code: string; name: string };

type ThemeRow = {
  id: string;
  name: string;
  description: string | null;
  stocks: StockBrief[];
};

const MAX_CHIPS = 10;

export default function AdminThemesPage() {
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [allStocks, setAllStocks] = useState<StockBrief[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [stockFilter, setStockFilter] = useState("");
  const masterSelectRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [t, s] = await Promise.all([
        apiGet<{ themes: ThemeRow[] }>("/themes"),
        apiGet<{ stocks: { id: string; code: string; name: string }[] }>("/stocks"),
      ]);
      setThemes(t.themes);
      setAllStocks(s.stocks);
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "로드 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setStockFilter("");
  }, [editId]);

  const filteredStocks = useMemo(() => {
    const q = stockFilter.trim().toLowerCase();
    if (!q) return allStocks;
    return allStocks.filter(
      (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [allStocks, stockFilter]);

  const allVisibleSelected =
    filteredStocks.length > 0 && filteredStocks.every((s) => selectedStockIds.has(s.id));
  const someVisibleSelected = filteredStocks.some((s) => selectedStockIds.has(s.id));

  useEffect(() => {
    const el = masterSelectRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected, editId, filteredStocks.length]);

  function startEdit(theme: ThemeRow) {
    setEditId(theme.id);
    setSelectedStockIds(new Set(theme.stocks.map((x) => x.id)));
  }

  async function saveMapping() {
    if (!editId) return;
    try {
      await apiSend(`/themes/${editId}/stocks`, "PUT", {
        stockIds: [...selectedStockIds],
      });
      setEditId(null);
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "저장 실패");
    }
  }

  async function createTheme(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/themes", "POST", { name, description: desc || null, isActive: true });
      setName("");
      setDesc("");
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "생성 실패");
    }
  }

  return (
    <div>
      {err ? <p style={{ color: "var(--down)" }}>{err}</p> : null}

      <form className="panel" onSubmit={createTheme} style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          테마 추가
        </div>
        <div className="form-row">
          <label>테마명</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>설명</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <button type="submit" className="primary">
          생성
        </button>
      </form>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-h">테마 목록 · 종목 매핑</div>
        <div className="panel-b" style={{ padding: 0 }}>
          {themes.length === 0 ? (
            <div className="admin-theme-empty">등록된 테마가 없습니다. 위에서 테마를 추가해 보세요.</div>
          ) : (
            <div className="admin-theme-list">
              {themes.map((th) => {
                const isEditing = editId === th.id;
                const chips = th.stocks.slice(0, MAX_CHIPS);
                const more = th.stocks.length - MAX_CHIPS;
                return (
                  <div key={th.id} className={`admin-theme-card${isEditing ? " is-editing" : ""}`}>
                    <div className="admin-theme-card-head">
                      <div className="admin-theme-card-head-left">
                        <div className="admin-theme-title">{th.name}</div>
                        {th.description ? <div className="admin-theme-desc">{th.description}</div> : null}
                        <span className="admin-theme-count">연결 종목 {th.stocks.length}개</span>
                      </div>
                      <div className="admin-theme-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                          onClick={() => (isEditing ? setEditId(null) : startEdit(th))}
                        >
                          {isEditing ? "편집 닫기" : "종목 편집"}
                        </button>
                      </div>
                    </div>

                    {!isEditing && th.stocks.length > 0 ? (
                      <div className="admin-theme-chips" aria-label="연결된 종목">
                        {chips.map((s) => (
                          <span key={s.id} className="admin-theme-chip" title={`${s.name} (${s.code})`}>
                            {s.name}
                          </span>
                        ))}
                        {more > 0 ? <span className="admin-theme-chip-more">+{more}개</span> : null}
                      </div>
                    ) : null}
                    {!isEditing && th.stocks.length === 0 ? (
                      <div className="admin-theme-chips">
                        <span className="admin-theme-chip-more">연결된 종목 없음</span>
                      </div>
                    ) : null}

                    {isEditing ? (
                      <div className="admin-theme-editor">
                        <div className="admin-theme-editor-tools">
                          <input
                            type="search"
                            placeholder="종목명·코드로 필터"
                            value={stockFilter}
                            onChange={(e) => setStockFilter(e.target.value)}
                            aria-label="종목 필터"
                          />
                          <label className="admin-theme-master-row">
                            <input
                              ref={masterSelectRef}
                              type="checkbox"
                              disabled={filteredStocks.length === 0}
                              checked={allVisibleSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStockIds((prev) => {
                                    const n = new Set(prev);
                                    for (const s of filteredStocks) n.add(s.id);
                                    return n;
                                  });
                                } else {
                                  setSelectedStockIds((prev) => {
                                    const n = new Set(prev);
                                    for (const s of filteredStocks) n.delete(s.id);
                                    return n;
                                  });
                                }
                              }}
                              aria-label={`필터된 종목 ${filteredStocks.length}개 전체 선택`}
                            />
                            <span>전체 선택</span>
                            <span className="admin-theme-master-hint">({filteredStocks.length}개)</span>
                          </label>
                        </div>
                        <div className="admin-theme-stock-grid" role="group" aria-label="종목 선택">
                          {filteredStocks.map((s) => (
                            <label key={s.id} className="admin-theme-stock-row">
                              <input
                                type="checkbox"
                                checked={selectedStockIds.has(s.id)}
                                onChange={(e) => {
                                  setSelectedStockIds((prev) => {
                                    const n = new Set(prev);
                                    if (e.target.checked) n.add(s.id);
                                    else n.delete(s.id);
                                    return n;
                                  });
                                }}
                              />
                              <span title={`${s.name} (${s.code})`}>
                                {s.name} <span style={{ color: "var(--muted-foreground)" }}>({s.code})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                        {filteredStocks.length === 0 ? (
                          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>필터에 맞는 종목이 없습니다.</p>
                        ) : null}
                        <div className="admin-theme-editor-actions">
                          <button type="button" className="primary" onClick={() => void saveMapping()}>
                            매핑 저장
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>
                            취소
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
