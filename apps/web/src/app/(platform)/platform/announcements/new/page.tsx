"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiSend } from "@/lib/api-client";
import {
  AnnouncementForm,
  EMPTY_FORM,
  inputLocalToIso,
  type AnnouncementFormValue,
} from "../_components/AnnouncementForm";

type CreatedResponse = { announcement: { id: string } };

export default function NewAnnouncementPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(value: AnnouncementFormValue) {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        scope: value.scope,
        tenantId: value.scope === "TENANT" ? value.tenantId || null : null,
        title: value.title.trim(),
        body: value.body,
        startsAt: inputLocalToIso(value.startsAt),
        endsAt: inputLocalToIso(value.endsAt),
        audienceRoles: value.audienceRoles
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        status: value.status === "ARCHIVED" ? "DRAFT" : value.status,
      };
      const created = await apiSend<CreatedResponse>("/platform/announcements", "POST", body);
      const id = (created as CreatedResponse).announcement.id;
      router.replace(`/platform/announcements/${id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = (e.body as { error?: { message?: string } } | null)?.error?.message;
        setErr(msg ?? `오류 ${e.status}`);
      } else {
        setErr("공지 작성에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link href="/platform/announcements" style={{ fontSize: 13 }}>← 목록</Link>
      </div>
      <h1 style={{ margin: "0 0 16px", fontSize: 20 }}>새 공지</h1>
      <div className="panel" style={{ padding: 16 }}>
        <AnnouncementForm
          initial={EMPTY_FORM}
          submitLabel="작성"
          saving={saving}
          errorMessage={err}
          onCancel={() => router.push("/platform/announcements")}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
