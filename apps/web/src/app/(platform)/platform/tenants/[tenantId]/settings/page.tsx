"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type SettingRow = { key: string; value: string; updatedAt: string };

type SettingsResponse = { settings: SettingRow[] };

export default function PlatformTenantSettingsPage() {
  const params = useParams();
  const tenantId = String(params.tenantId ?? "");
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await apiGet<SettingsResponse>(`/platform/tenants/${encodeURIComponent(tenantId)}/settings`);
      setRows(res.settings);
      const next: Record<string, string> = {};
      for (const r of res.settings) next[r.key] = r.value;
      setEdits(next);
    } catch (e) {
      setRows([]);
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void load();
  }, [tenantId, load]);

  async function saveRow(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const value = edits[key] ?? row.value;
    setBusyKey(key);
    setMsg(null);
    try {
      const res = await apiSend<{ setting: SettingRow }>(
        `/platform/tenants/${encodeURIComponent(tenantId)}/settings/${encodeURIComponent(key)}`,
        "PUT",
        { value, expectedUpdatedAt: row.updatedAt },
      );
      if (res?.setting) {
        setRows((prev) => prev.map((r) => (r.key === key ? res.setting : r)));
        setEdits((prev) => ({ ...prev, [key]: res!.setting.value }));
        setMsg(`「${key}」 저장됨`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setMsg("다른 곳에서 먼저 수정되었습니다. 목록을 새로고침합니다.");
        await load();
      } else if (e instanceof ApiError) {
        setMsg(`저장 실패 (${e.status})`);
      } else {
        setMsg("저장에 실패했습니다.");
      }
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        테넌트 <code style={{ fontSize: 12 }}>{tenantId}</code>
      </p>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>시스템 설정</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        값 변경 후 행 단위 저장. 동시 편집 시 409가 나면 자동으로 다시 불러옵니다.
      </p>

      {msg ? (
        <p role="status" style={{ fontSize: 13, marginBottom: 12 }}>
          {msg}
        </p>
      ) : null}
      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>
          {err}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>설정 행이 없습니다.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th>키</th>
                <th>값</th>
                <th>수정 시각</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12 }}>{r.key}</td>
                  <td>
                    <input
                      value={edits[r.key] ?? ""}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [r.key]: e.target.value }))}
                      style={{ width: "100%", minWidth: 200 }}
                      aria-label={`${r.key} 값`}
                    />
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                    {new Date(r.updatedAt).toLocaleString("ko-KR")}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: 12 }}
                      disabled={busyKey === r.key || (edits[r.key] ?? r.value) === r.value}
                      onClick={() => void saveRow(r.key)}
                    >
                      {busyKey === r.key ? "저장 중…" : "저장"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href={`/platform/tenants/${tenantId}`} className="btn btn-secondary">
          ← 테넌트 허브
        </Link>
      </p>
    </div>
  );
}
