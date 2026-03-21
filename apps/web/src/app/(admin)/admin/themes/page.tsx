"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type StockBrief = { id: string; code: string; name: string };

type ThemeRow = {
  id: string;
  name: string;
  description: string | null;
  stocks: StockBrief[];
};

export default function AdminThemesPage() {
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [allStocks, setAllStocks] = useState<StockBrief[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());

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
      <h1 style={{ marginTop: 0 }}>테마 관리</h1>
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
        <div className="panel-b">
          {themes.map((th) => (
            <div
              key={th.id}
              style={{
                borderBottom: "1px solid var(--border)",
                paddingBottom: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {th.name}{" "}
                <button type="button" onClick={() => startEdit(th)}>
                  종목 편집
                </button>
              </div>
              <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{th.description ?? ""}</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                연결 종목: {th.stocks.map((s) => s.name).join(", ") || "없음"}
              </div>

              {editId === th.id ? (
                <div style={{ marginTop: 10 }}>
                  {allStocks.map((s) => (
                    <label
                      key={s.id}
                      style={{ display: "block", marginBottom: 4, cursor: "pointer" }}
                    >
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
                      />{" "}
                      {s.name} ({s.code})
                    </label>
                  ))}
                  <button type="button" className="primary" style={{ marginTop: 8 }} onClick={() => void saveMapping()}>
                    매핑 저장
                  </button>
                  <button type="button" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setEditId(null)}>
                    취소
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
