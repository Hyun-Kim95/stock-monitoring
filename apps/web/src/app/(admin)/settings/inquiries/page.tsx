"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";

type Author = { id: string; email: string; displayName: string | null };

type InquiryListItem = {
  id: string;
  subject: string | null;
  message: string;
  createdAt: string;
  author: Author;
  replyCount: number;
};

type ReplyItem = {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
};

type InquiryDetail = {
  id: string;
  subject: string | null;
  message: string;
  createdAt: string;
  author: Author;
  replies: ReplyItem[];
};

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function preview(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function AdminInquiriesPage() {
  const [list, setList] = useState<InquiryListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);
  const [newDone, setNewDone] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setListErr(null);
      setListLoading(true);
      const data = await apiGet<{ inquiries: InquiryListItem[] }>("/inquiries");
      setList(data.inquiries);
    } catch (e) {
      setListErr(e instanceof ApiError ? `목록 오류 ${e.status}` : "목록 로드 실패");
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetailErr(null);
      setDetailLoading(true);
      const data = await apiGet<{ inquiry: InquiryDetail }>(`/inquiries/${encodeURIComponent(id)}`);
      setDetail(data.inquiry);
    } catch (e) {
      setDetail(null);
      setDetailErr(e instanceof ApiError ? `상세 오류 ${e.status}` : "상세 로드 실패");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setReplyBody("");
      setReplyErr(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setNewErr(null);
    setNewSubmitting(true);
    try {
      const res = await apiSend<{ inquiry: { id: string } }>("/inquiries", "POST", {
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      setNewDone(true);
      setSubject("");
      setMessage("");
      await loadList();
      if (res?.inquiry?.id) {
        setSelectedId(res.inquiry.id);
      }
    } catch (ex) {
      if (ex instanceof ApiError) {
        const b = ex.body as { error?: { message?: string } } | null;
        setNewErr(b?.error?.message ?? `요청 실패 (${ex.status})`);
      } else {
        setNewErr("전송에 실패했습니다.");
      }
    } finally {
      setNewSubmitting(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setReplyErr(null);
    setReplySubmitting(true);
    try {
      await apiSend(`/inquiries/${encodeURIComponent(selectedId)}/replies`, "POST", {
        body: replyBody.trim(),
      });
      setReplyBody("");
      await loadList();
      await loadDetail(selectedId);
    } catch (ex) {
      if (ex instanceof ApiError) {
        const b = ex.body as { error?: { message?: string } } | null;
        setReplyErr(b?.error?.message ?? `답변 실패 (${ex.status})`);
      } else {
        setReplyErr("답변 저장에 실패했습니다.");
      }
    } finally {
      setReplySubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>문의하기</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        새 문의를 남기거나 목록에서 선택해 내용·답변을 확인합니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          새 문의
        </div>
        {newDone ? (
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>접수되었습니다.</p>
        ) : null}
        {newErr ? (
          <p style={{ color: "var(--down)", fontSize: 13 }} role="alert">
            {newErr}
          </p>
        ) : null}
        <form onSubmit={(e) => void submitNew(e)}>
          <div className="form-row">
            <label htmlFor="inq-subject">제목 (선택)</label>
            <input
              id="inq-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setNewDone(false);
              }}
              maxLength={200}
              disabled={newSubmitting}
            />
          </div>
          <div className="form-row">
            <label htmlFor="inq-message">내용 (필수)</label>
            <textarea
              id="inq-message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setNewDone(false);
              }}
              required
              rows={4}
              maxLength={8000}
              disabled={newSubmitting}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          <button type="submit" className="primary" disabled={newSubmitting || !message.trim()}>
            {newSubmitting ? "전송 중…" : "문의 보내기"}
          </button>
        </form>
      </div>

      <div className="admin-inquiries-grid">
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div className="panel-h" style={{ margin: 0 }}>
            문의 목록
          </div>
          {listErr ? <p style={{ padding: 12, color: "var(--down)", fontSize: 13 }}>{listErr}</p> : null}
          {listLoading ? <p style={{ padding: 12, fontSize: 13 }}>불러오는 중…</p> : null}
          {!listLoading && !listErr && list.length === 0 ? (
            <p style={{ padding: 12, fontSize: 13, color: "var(--muted-foreground)" }}>등록된 문의가 없습니다.</p>
          ) : null}
          {!listLoading && list.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>제목·요약</th>
                    <th>문의자</th>
                    <th className="num">답변</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const active = row.id === selectedId;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        style={{
                          cursor: "pointer",
                          background: active ? "color-mix(in oklab, var(--primary) 12%, transparent)" : undefined,
                        }}
                      >
                        <td>{formatDt(row.createdAt)}</td>
                        <td>{row.subject?.trim() || preview(row.message, 48)}</td>
                        <td style={{ wordBreak: "break-all" }}>{row.author.email}</td>
                        <td className="num">{row.replyCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="panel" style={{ padding: 12, minHeight: 200 }}>
          <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
            내용·답변
          </div>
          {!selectedId ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>목록에서 문의를 선택하세요.</p>
          ) : null}
          {selectedId && detailLoading ? <p style={{ fontSize: 13 }}>불러오는 중…</p> : null}
          {detailErr ? <p style={{ color: "var(--down)", fontSize: 13 }}>{detailErr}</p> : null}
          {detail && !detailLoading ? (
            <>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
                {formatDt(detail.createdAt)} · {detail.author.email}
                {detail.author.displayName ? ` (${detail.author.displayName})` : ""}
              </div>
              {detail.subject ? <div style={{ fontWeight: 600, marginBottom: 8 }}>{detail.subject}</div> : null}
              <pre
                style={{
                  margin: "0 0 16px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {detail.message}
              </pre>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>답변</div>
              {detail.replies.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>아직 답변이 없습니다.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
                  {detail.replies.map((r) => (
                    <li
                      key={r.id}
                      style={{
                        borderLeft: "3px solid var(--border)",
                        paddingLeft: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        {formatDt(r.createdAt)} · {r.author.email}
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.body}</div>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={(e) => void submitReply(e)}>
                {replyErr ? (
                  <p style={{ color: "var(--down)", fontSize: 13 }} role="alert">
                    {replyErr}
                  </p>
                ) : null}
                <div className="form-row">
                  <label htmlFor="reply-body">답변 추가</label>
                  <textarea
                    id="reply-body"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={4}
                    maxLength={8000}
                    placeholder="답변 내용"
                    disabled={replySubmitting}
                    style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                <button type="submit" className="primary" disabled={replySubmitting || !replyBody.trim()}>
                  {replySubmitting ? "저장 중…" : "답변 등록"}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
