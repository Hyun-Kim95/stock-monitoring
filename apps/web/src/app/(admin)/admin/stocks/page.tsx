"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type Stock = {
  id: string;
  code: string;
  name: string;
  searchAlias: string | null;
  isActive: boolean;
  themes: { id: string; name: string }[];
};

export default function AdminStocksPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");

  const load = useCallback(async () => {
    try {
      setErr(null);
      const data = await apiGet<{ stocks: Stock[] }>("/stocks");
      setStocks(data.stocks);
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "로드 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStock(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/stocks", "POST", {
        code,
        name,
        searchAlias: alias || null,
        isActive: true,
      });
      setCode("");
      setName("");
      setAlias("");
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
      <h1 style={{ marginTop: 0 }}>종목 관리</h1>
      {err ? <p style={{ color: "var(--down)" }}>{err}</p> : null}

      <div className="admin-grid">
        <form className="panel" onSubmit={createStock} style={{ padding: 12 }}>
          <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
            종목 추가
          </div>
          <div className="form-row">
            <label>종목코드</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>종목명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>검색 별칭 (쉼표 구분)</label>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} />
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{s.searchAlias ?? "—"}</td>
                    <td>
                      <button type="button" className="danger" onClick={() => void deactivate(s.id)}>
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
