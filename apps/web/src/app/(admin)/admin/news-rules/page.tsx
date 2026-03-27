"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type Rule = {
  id: string;
  scope: "GLOBAL" | "STOCK";
  stockId: string | null;
  includeKeyword: string | null;
  excludeKeyword: string | null;
  priority: number;
  isActive: boolean;
};

export default function AdminNewsRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stocks, setStocks] = useState<{ id: string; code: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<"GLOBAL" | "STOCK">("GLOBAL");
  const [stockId, setStockId] = useState("");
  const [includeKw, setIncludeKw] = useState("");
  const [excludeKw, setExcludeKw] = useState("");
  const [priority, setPriority] = useState(0);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [r, s] = await Promise.all([
        apiGet<{ rules: Rule[] }>("/news-rules"),
        apiGet<{ stocks: { id: string; code: string; name: string }[] }>("/stocks"),
      ]);
      setRules(r.rules);
      setStocks(s.stocks);
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "로드 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stockLabelById = new Map(stocks.map((s) => [s.id, `${s.name} (${s.code})`]));

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/news-rules", "POST", {
        scope,
        stockId: scope === "STOCK" ? stockId || null : null,
        includeKeyword: includeKw || null,
        excludeKeyword: excludeKw || null,
        priority,
        isActive: true,
      });
      setIncludeKw("");
      setExcludeKw("");
      setPriority(0);
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "생성 실패");
    }
  }

  async function removeRule(id: string) {
    try {
      await apiSend(`/news-rules/${id}`, "DELETE");
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "삭제 실패");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>뉴스 검색 규칙</h1>
      {err ? <p style={{ color: "var(--down)" }}>{err}</p> : null}

      <form className="panel" onSubmit={createRule} style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          규칙 추가
        </div>
        <div className="form-row">
          <label>범위</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as "GLOBAL" | "STOCK")}>
            <option value="GLOBAL">전역</option>
            <option value="STOCK">종목</option>
          </select>
        </div>
        {scope === "STOCK" ? (
          <div className="form-row">
            <label>종목</label>
            <select value={stockId} onChange={(e) => setStockId(e.target.value)} required>
              <option value="">선택</option>
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="form-row">
          <label>포함 키워드</label>
          <input value={includeKw} onChange={(e) => setIncludeKw(e.target.value)} />
        </div>
        <div className="form-row">
          <label>제외 키워드</label>
          <input value={excludeKw} onChange={(e) => setExcludeKw(e.target.value)} />
        </div>
        <div className="form-row">
          <label>우선순위 (클수록 우선)</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </div>
        <button type="submit" className="primary">
          추가
        </button>
      </form>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-h">규칙 목록</div>
        <div className="panel-b">
          <table className="data-table">
            <thead>
              <tr>
                <th>범위</th>
                <th>종목</th>
                <th>포함</th>
                <th>제외</th>
                <th>우선</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.scope}</td>
                  <td>{r.stockId ? (stockLabelById.get(r.stockId) ?? r.stockId) : "—"}</td>
                  <td>{r.includeKeyword ?? "—"}</td>
                  <td>{r.excludeKeyword ?? "—"}</td>
                  <td>{r.priority}</td>
                  <td>
                    <button type="button" className="danger" onClick={() => void removeRule(r.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
