"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api-client";

type UserDetail = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
    oauthAccounts: { provider: string; createdAt: string }[];
    memberships: { tenantId: string; tenantName: string; role: string }[];
  };
};

export default function PlatformUserDetailPage() {
  const params = useParams();
  const userId = String(params.userId ?? "");
  const [data, setData] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<UserDetail>(`/platform/users/${encodeURIComponent(userId)}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setErr(e instanceof ApiError ? `오류 ${e.status}` : "불러오기 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>;
  if (err || !data) {
    return (
      <div>
        <p role="alert" style={{ color: "var(--down)" }}>
          {err ?? "사용자를 찾을 수 없습니다."}
        </p>
        <Link href="/platform/users" className="btn btn-secondary" style={{ marginTop: 12 }}>
          검색으로
        </Link>
      </div>
    );
  }

  const { user } = data;

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        사용자 ID <code style={{ fontSize: 12 }}>{user.id}</code>
      </p>
      <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>{user.email}</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14 }}>표시명: {user.displayName ?? "—"}</p>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--muted-foreground)" }}>
        가입 {new Date(user.createdAt).toLocaleString("ko-KR")}
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          OAuth 연결
        </div>
        {user.oauthAccounts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>연결된 계정이 없습니다.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {user.oauthAccounts.map((o) => (
              <li key={`${o.provider}-${o.createdAt}`} style={{ fontSize: 13 }}>
                {o.provider} — {new Date(o.createdAt).toLocaleString("ko-KR")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          멤버십 (전체 테넌트)
        </div>
        {user.memberships.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
            소속 테넌트가 없습니다. (세션의 테넌트와 무관하게 전역 조회입니다.)
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 400 }}>
              <thead>
                <tr>
                  <th>테넌트</th>
                  <th>역할</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {user.memberships.map((m) => (
                  <tr key={m.tenantId}>
                    <td>{m.tenantName}</td>
                    <td>{m.role}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/platform/tenants/${m.tenantId}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
                        테넌트
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Link href="/platform/users" className="btn btn-secondary">
        ← 사용자 검색
      </Link>
    </div>
  );
}
