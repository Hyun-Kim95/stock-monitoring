"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiSend } from "@/lib/api-client";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function ContactPage() {
  const router = useRouter();
  const { user, loading } = useAuthSession();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await apiSend<{ inquiry: { id: string; createdAt: string } }>("/inquiries", "POST", {
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      setDone(true);
      setSubject("");
      setMessage("");
    } catch (ex) {
      if (ex instanceof ApiError) {
        const b = ex.body as { error?: { message?: string } } | null;
        setErr(b?.error?.message ?? `요청 실패 (${ex.status})`);
      } else {
        setErr("전송에 실패했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>세션 확인 중...</div>;
  if (!user) return null;

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" className="btn btn-secondary" style={{ fontSize: 13 }}>
          ← 대시보드
        </Link>
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>문의하기</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        내용을 남기면 저장됩니다. 답변은 별도 채널로 드릴 예정입니다.
      </p>

      {done ? (
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>문의가 접수되었습니다. 감사합니다.</p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setDone(false)}>
            추가 문의 작성
          </button>
        </div>
      ) : null}

      {!done ? (
        <form className="panel" onSubmit={(e) => void onSubmit(e)} style={{ padding: 16 }}>
          {err ? (
            <p style={{ color: "var(--down)", marginTop: 0, fontSize: 13 }} role="alert">
              {err}
            </p>
          ) : null}
          <div className="form-row">
            <label htmlFor="contact-subject">제목 (선택)</label>
            <input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="한 줄로 요약"
              disabled={submitting}
            />
          </div>
          <div className="form-row">
            <label htmlFor="contact-message">내용 (필수)</label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={8}
              maxLength={8000}
              placeholder="문의 내용을 입력해 주세요."
              disabled={submitting}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="submit" className="primary" disabled={submitting || !message.trim()}>
              {submitting ? "전송 중…" : "보내기"}
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
