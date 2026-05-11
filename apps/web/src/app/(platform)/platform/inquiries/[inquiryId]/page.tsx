"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type Author = { id: string; email: string | null; displayName: string | null };

type ReplyItem = { id: string; body: string; createdAt: string; author: Author };

type InquiryDetail = {
  inquiry: {
    id: string;
    tenantId: string;
    subject: string | null;
    message: string;
    createdAt: string;
    author: Author;
    replies: ReplyItem[];
  };
};

function authorLabel(a: Author) {
  if (a.displayName) return a.displayName;
  if (a.email) return a.email;
  return "삭제된 사용자";
}

export default function PlatformInquiryDetailPage() {
  const params = useParams();
  const inquiryId = String(params.inquiryId ?? "");
  const [data, setData] = useState<InquiryDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);

  async function reload() {
    const res = await apiGet<InquiryDetail>(`/platform/inquiries/${encodeURIComponent(inquiryId)}`);
    setData(res);
  }

  useEffect(() => {
    if (!inquiryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<InquiryDetail>(`/platform/inquiries/${encodeURIComponent(inquiryId)}`);
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
  }, [inquiryId]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setReplyErr(null);
    setReplyBusy(true);
    try {
      await apiSend(`/platform/inquiries/${encodeURIComponent(inquiryId)}/replies`, "POST", {
        body: replyBody.trim(),
      });
      setReplyBody("");
      await reload();
    } catch (ex) {
      if (ex instanceof ApiError) {
        const b = ex.body as { error?: { message?: string } } | null;
        setReplyErr(b?.error?.message ?? `실패 (${ex.status})`);
      } else {
        setReplyErr("전송에 실패했습니다.");
      }
    } finally {
      setReplyBusy(false);
    }
  }

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>;
  if (err || !data) {
    return (
      <div>
        <p role="alert" style={{ color: "var(--down)" }}>
          {err ?? "문의를 찾을 수 없습니다."}
        </p>
        <Link href="/platform/tenants" className="btn btn-secondary" style={{ marginTop: 12 }}>
          테넌트 목록
        </Link>
      </div>
    );
  }

  const { inquiry } = data;

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        문의 ID <code style={{ fontSize: 12 }}>{inquiry.id}</code> · 테넌트{" "}
        <Link href={`/platform/tenants/${inquiry.tenantId}`} style={{ fontSize: 12 }}>
          {inquiry.tenantId}
        </Link>
      </p>
      <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>{inquiry.subject ?? "(제목 없음)"}</h1>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>
        {authorLabel(inquiry.author)} · {new Date(inquiry.createdAt).toLocaleString("ko-KR")}
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          본문
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono), monospace",
            fontSize: 13,
          }}
        >
          {inquiry.message}
        </pre>
      </div>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          답변
        </div>
        {inquiry.replies.length === 0 ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted-foreground)" }}>등록된 답변이 없습니다.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {inquiry.replies.map((r) => (
              <li
                key={r.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  padding: "12px 0",
                  fontSize: 13,
                }}
              >
                <div style={{ color: "var(--muted-foreground)", marginBottom: 6 }}>
                  {authorLabel(r.author)} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{r.body}</div>
              </li>
            ))}
          </ul>
        )}
        {replyErr ? (
          <p role="alert" style={{ color: "var(--down)", fontSize: 13 }}>
            {replyErr}
          </p>
        ) : null}
        <form onSubmit={(e) => void submitReply(e)}>
          <label htmlFor="reply-body" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
            운영자 답변 작성
          </label>
          <textarea
            id="reply-body"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            style={{ width: "100%", marginBottom: 8 }}
            maxLength={8000}
            disabled={replyBusy}
          />
          <button type="submit" className="btn" disabled={replyBusy || !replyBody.trim()}>
            {replyBusy ? "전송 중…" : "답변 등록"}
          </button>
        </form>
      </div>

      <Link href={`/platform/tenants/${inquiry.tenantId}/inquiries`} className="btn btn-secondary">
        ← 이 테넌트 문의 목록
      </Link>
    </div>
  );
}
