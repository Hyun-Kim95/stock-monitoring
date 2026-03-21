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
  const [selectedSettingKey, setSelectedSettingKey] = useState<string | null>(null);

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
      if (ex instanceof ApiError && ex.status === 401) {
        setErr(
          "관리자 인증 실패: 헤더에 토큰이 없거나 서버의 ADMIN_API_TOKEN과 다릅니다. 루트 .env의 NEXT_PUBLIC_ADMIN_TOKEN을 ADMIN_API_TOKEN과 동일하게 맞춘 뒤 dev 서버를 다시 실행하세요.",
        );
        return;
      }
      if (ex instanceof ApiError) {
        const b = ex.body as { error?: { message?: string } } | null;
        const msg = b?.error?.message;
        setErr(msg ?? JSON.stringify(ex.body ?? ex.message));
        return;
      }
      setErr("저장 실패");
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
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              selectedSettingKey &&
              settings.find((r) => r.key === selectedSettingKey)?.masked
                ? "마스킹된 항목 — 실제 값을 다시 입력하세요"
                : undefined
            }
            required
          />
        </div>
        <button type="submit" className="primary">
          저장
        </button>
      </form>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-h">
          현재 설정
          <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted-foreground)", marginLeft: 8 }}>
            행 클릭 시 위 폼에 반영
          </span>
        </div>

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
              {settings.map((s) => {
                const sel = selectedSettingKey === s.key;
                return (
                  <tr
                    key={s.key}
                    style={{
                      cursor: "pointer",
                      background: sel ? "rgba(88,166,255,0.12)" : undefined,
                    }}
                    onClick={() => {
                      setSelectedSettingKey(s.key);
                      setKey(s.key);
                      setValue(s.masked ? "" : s.value);
                      setErr(null);
                    }}
                  >
                    <td>{s.key}</td>
                    <td>{s.value}</td>
                    <td>{s.masked ? "예" : "아니오"}</td>
                    <td>{new Date(s.updatedAt).toLocaleString("ko-KR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
