"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";
import {
  AnnouncementForm,
  EMPTY_FORM,
  inputLocalToIso,
  normalizeInitial,
  type AnnouncementFormValue,
  type AnnouncementScope,
  type AnnouncementStatus,
} from "../_components/AnnouncementForm";

type AnnouncementDetail = {
  id: string;
  scope: AnnouncementScope;
  tenantId: string | null;
  tenant: { id: string; name: string } | null;
  title: string;
  body: string;
  status: AnnouncementStatus;
  startsAt: string | null;
  endsAt: string | null;
  audienceRoles: string[];
  createdBy: { id: string; email: string | null; displayName: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export default function AnnouncementEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [initial, setInitial] = useState<AnnouncementFormValue>(EMPTY_FORM);
  const [meta, setMeta] = useState<Pick<AnnouncementDetail, "createdBy" | "createdAt" | "updatedAt"> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiGet<{ announcement: AnnouncementDetail }>(`/platform/announcements/${id}`);
      const row = res.announcement;
      setInitial(
        normalizeInitial({
          scope: row.scope,
          tenantId: row.tenantId,
          title: row.title,
          body: row.body,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          audienceRoles: row.audienceRoles,
          status: row.status,
        }),
      );
      setMeta({ createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else {
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "공지를 불러오지 못했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  async function handleSubmit(value: AnnouncementFormValue) {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        title: value.title.trim(),
        body: value.body,
        startsAt: inputLocalToIso(value.startsAt),
        endsAt: inputLocalToIso(value.endsAt),
        audienceRoles: value.audienceRoles
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        status: value.status,
      };
      await apiSend(`/platform/announcements/${id}`, "PUT", body);
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = (e.body as { error?: { message?: string } } | null)?.error?.message;
        setErr(msg ?? `오류 ${e.status}`);
      } else {
        setErr("저장에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 공지를 삭제할까요? 이 동작은 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    setErr(null);
    try {
      await apiSend(`/platform/announcements/${id}`, "DELETE");
      router.replace("/platform/announcements");
    } catch (e) {
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "삭제에 실패했습니다.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <Link href="/platform/announcements" style={{ fontSize: 13 }}>← 목록</Link>
        </div>
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <Link href="/platform/announcements" style={{ fontSize: 13 }}>← 목록</Link>
        </div>
        <p style={{ color: "var(--muted-foreground)" }}>해당 공지를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link href="/platform/announcements" style={{ fontSize: 13 }}>← 목록</Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>공지 편집</h1>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--muted-foreground)" }}>
        작성자: {meta?.createdBy?.displayName ?? meta?.createdBy?.email ?? "—"} · 작성일:{" "}
        {meta?.createdAt ? new Date(meta.createdAt).toLocaleString("ko-KR") : "—"} · 마지막 수정:{" "}
        {meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString("ko-KR") : "—"}
      </p>
      <div className="panel" style={{ padding: 16 }}>
        <AnnouncementForm
          initial={initial}
          submitLabel="저장"
          saving={saving}
          errorMessage={err}
          allowArchived
          onCancel={() => router.push("/platform/announcements")}
          extraActions={
            <button
              type="button"
              className="btn"
              style={{
                background: "var(--down, #d24545)",
                color: "#fff",
                opacity: deleting ? 0.6 : 1,
              }}
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          }
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
