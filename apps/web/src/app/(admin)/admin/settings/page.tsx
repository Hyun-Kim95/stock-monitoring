"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type SettingRow = {
  key: string;
  value: string;
  masked: boolean;
  updatedAt: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState("market_data.provider");
  const [value, setValue] = useState("mock");

  const load = useCallback(async () => {
    try {
      setErr(null);
      const data = await apiGet<{ settings: SettingRow[] }>("/settings");
      setSettings(data.settings);
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "로드 실패");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend(`/settings/${encodeURIComponent(key)}`, "PUT", { value });
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? JSON.stringify(ex.body) : "저장 실패");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>시스템 설정</h1>
      {err ? <p style={{ color: "var(--down)" }}>{err}</p> : null}

      <form className="panel" onSubmit={save} style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          키-값 갱신 (민감키는 마스킹되어 표시)
        </div>
        <div className="form-row">
          <label>setting_key</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>새 값 (저장 시 서버에 평문 저장)</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} required />
        </div>
        <button type="submit" className="primary">
          저장
        </button>
      </form>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-h">현재 설정</div>
        <div className="panel-b">
          <table className="data-table">
            <thead>
              <tr>
                <th>키</th>
                <th>값 (표시)</th>
                <th>마스킹</th>
                <th>갱신</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.key}>
                  <td>{s.key}</td>
                  <td>{s.value}</td>
                  <td>{s.masked ? "예" : "아니오"}</td>
                  <td>{new Date(s.updatedAt).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
