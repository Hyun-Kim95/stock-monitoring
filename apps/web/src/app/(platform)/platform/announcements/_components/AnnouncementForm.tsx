"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";

export type AnnouncementScope = "GLOBAL" | "TENANT";
export type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type AnnouncementFormValue = {
  scope: AnnouncementScope;
  tenantId: string;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  audienceRoles: string;
  status: AnnouncementStatus;
};

export const EMPTY_FORM: AnnouncementFormValue = {
  scope: "GLOBAL",
  tenantId: "",
  title: "",
  body: "",
  startsAt: "",
  endsAt: "",
  audienceRoles: "",
  status: "DRAFT",
};

type TenantOpt = { id: string; name: string };

type Props = {
  initial: AnnouncementFormValue;
  submitLabel: string;
  saving: boolean;
  errorMessage?: string | null;
  /** 편집 화면에서 ARCHIVED 옵션을 노출하려면 true. 작성 시에는 false. */
  allowArchived?: boolean;
  /** 폼 외부에서 추가 동작(삭제 등)을 배치할 영역. */
  extraActions?: React.ReactNode;
  onCancel?: () => void;
  onSubmit: (value: AnnouncementFormValue) => Promise<void> | void;
};

function isoToInputLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function inputLocalToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function normalizeInitial(raw: {
  scope: AnnouncementScope;
  tenantId: string | null;
  title: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  audienceRoles: string[];
  status: AnnouncementStatus;
}): AnnouncementFormValue {
  return {
    scope: raw.scope,
    tenantId: raw.tenantId ?? "",
    title: raw.title,
    body: raw.body,
    startsAt: isoToInputLocal(raw.startsAt),
    endsAt: isoToInputLocal(raw.endsAt),
    audienceRoles: raw.audienceRoles.join(", "),
    status: raw.status,
  };
}

export function AnnouncementForm({
  initial,
  submitLabel,
  saving,
  errorMessage,
  allowArchived,
  extraActions,
  onCancel,
  onSubmit,
}: Props) {
  const [value, setValue] = useState<AnnouncementFormValue>(initial);
  const [tenantOpts, setTenantOpts] = useState<TenantOpt[]>([]);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiGet<{ tenants: TenantOpt[] }>(`/platform/tenants?page=1&pageSize=50`);
        if (mounted) setTenantOpts(res.tenants);
      } catch {
        if (mounted) setTenantOpts([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(value);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13 }}>스코프</span>
          <select
            value={value.scope}
            onChange={(e) =>
              setValue((v) => ({
                ...v,
                scope: e.target.value as AnnouncementScope,
                tenantId: (e.target.value as AnnouncementScope) === "GLOBAL" ? "" : v.tenantId,
              }))
            }
          >
            <option value="GLOBAL">전역 (모든 테넌트)</option>
            <option value="TENANT">특정 테넌트</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13 }}>테넌트</span>
          <select
            value={value.tenantId}
            onChange={(e) => setValue((v) => ({ ...v, tenantId: e.target.value }))}
            disabled={value.scope !== "TENANT"}
          >
            <option value="">선택…</option>
            {tenantOpts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13 }}>상태</span>
          <select
            value={value.status}
            onChange={(e) => setValue((v) => ({ ...v, status: e.target.value as AnnouncementStatus }))}
          >
            <option value="DRAFT">초안 (DRAFT)</option>
            <option value="PUBLISHED">발행 (PUBLISHED)</option>
            {allowArchived ? <option value="ARCHIVED">취소 (ARCHIVED)</option> : null}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13 }}>게시 시작 (선택)</span>
          <input
            type="datetime-local"
            value={value.startsAt}
            onChange={(e) => setValue((v) => ({ ...v, startsAt: e.target.value }))}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13 }}>게시 종료 (선택)</span>
          <input
            type="datetime-local"
            value={value.endsAt}
            onChange={(e) => setValue((v) => ({ ...v, endsAt: e.target.value }))}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
          <span style={{ fontSize: 13 }}>제목</span>
          <input
            value={value.title}
            onChange={(e) => setValue((v) => ({ ...v, title: e.target.value }))}
            maxLength={200}
            required
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
          <span style={{ fontSize: 13 }}>본문</span>
          <textarea
            value={value.body}
            onChange={(e) => setValue((v) => ({ ...v, body: e.target.value }))}
            rows={8}
            maxLength={20000}
            required
            style={{ resize: "vertical", minHeight: 120 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
          <span style={{ fontSize: 13 }}>대상 역할 (쉼표로 구분, 선택)</span>
          <input
            value={value.audienceRoles}
            onChange={(e) => setValue((v) => ({ ...v, audienceRoles: e.target.value }))}
            placeholder="예: OWNER, ADMIN"
          />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            비워두면 모든 역할이 대상입니다. 노출 UI는 다음 사이클에서 적용됩니다.
          </span>
        </label>
      </div>

      {errorMessage ? (
        <p role="alert" style={{ color: "var(--down)" }}>{errorMessage}</p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "저장 중…" : submitLabel}
          </button>
          {onCancel ? (
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              취소
            </button>
          ) : null}
        </div>
        <div>{extraActions}</div>
      </div>
    </form>
  );
}
