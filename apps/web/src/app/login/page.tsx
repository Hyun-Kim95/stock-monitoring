"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authStartUrl(provider: "google" | "kakao" | "naver") {
  const next = encodeURIComponent("/");
  return `${apiBase}/auth/${provider}/start?next=${next}`;
}

type Notice = { tone: "error" | "info"; text: string };

export default function LoginPage() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const u = new URL(window.location.href);
    const errorParam = u.searchParams.get("error");
    const reason = u.searchParams.get("reason");
    if (errorParam) {
      setNotice({ tone: "error", text: `로그인 실패: ${errorParam}` });
      return;
    }
    if (reason === "forbidden") {
      setNotice({
        tone: "info",
        text: "접근 권한이 없어 로그아웃되었습니다. 권한이 있는 계정으로 다시 로그인하세요.",
      });
    }
  }, []);

  return (
    <main className="login-page-root">
      <section className="panel login-page-card">
        <h1 style={{ margin: 0, marginBottom: 12 }}>로그인</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>SNS 계정으로 로그인하세요.</p>
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            style={{ color: notice.tone === "error" ? "var(--down)" : "var(--muted-foreground)" }}
          >
            {notice.text}
          </p>
        ) : null}
        <div className="login-oauth-stack">
          <a className="btn login-oauth-btn" href={authStartUrl("google")}>
            Google로 로그인
          </a>
          <a className="btn login-oauth-btn" href={authStartUrl("kakao")}>
            Kakao로 로그인
          </a>
          <a className="btn login-oauth-btn" href={authStartUrl("naver")}>
            Naver로 로그인
          </a>
        </div>
      </section>
    </main>
  );
}
