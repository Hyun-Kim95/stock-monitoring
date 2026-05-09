"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authStartUrl(provider: "google" | "kakao" | "naver") {
  const next = encodeURIComponent("/");
  return `${apiBase}/auth/${provider}/start?next=${next}`;
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    setError(u.searchParams.get("error"));
  }, []);
  const message = (() => {
    if (!error) return null;
    return `로그인 실패: ${error}`;
  })();

  return (
    <main className="login-page-root">
      <section className="panel login-page-card">
        <h1 style={{ margin: 0, marginBottom: 12 }}>로그인</h1>
        <p style={{ marginTop: 0, opacity: 0.8 }}>SNS 계정으로 로그인하세요.</p>
        {message ? <p style={{ color: "var(--down)" }}>{message}</p> : null}
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
