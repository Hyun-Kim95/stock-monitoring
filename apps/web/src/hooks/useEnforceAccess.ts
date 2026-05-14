"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import type { SessionUser } from "./useAuthSession";

export type AccessGate = "loading" | "denied" | "ok";

type Options = {
  loading: boolean;
  user: SessionUser | null;
  /** true면 가드 통과. false면 강제 로그아웃 후 `/login?reason=forbidden`. */
  isAllowed: (user: SessionUser) => boolean;
  refresh: () => Promise<void>;
};

/**
 * 보호된 라우트 진입 가드. 본문이 렌더되기 전에 권한을 평가하고
 * - 미로그인이면 `/login`
 * - 로그인은 됐지만 권한이 없으면 `/auth/logout` POST 후 `/login?reason=forbidden`
 * 으로 보낸다. 반환되는 `gate`로 layout이 children 노출 시점을 판정한다.
 */
export function useEnforceAccess({ loading, user, isAllowed, refresh }: Options): AccessGate {
  const router = useRouter();
  const enforcedRef = useRef(false);

  const gate: AccessGate = useMemo(() => {
    if (loading) return "loading";
    if (!user) return "denied";
    return isAllowed(user) ? "ok" : "denied";
  }, [loading, user, isAllowed]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      enforcedRef.current = false;
      router.replace("/login");
      return;
    }
    if (!isAllowed(user)) {
      if (enforcedRef.current) return;
      enforcedRef.current = true;
      (async () => {
        try {
          await apiSend("/auth/logout", "POST");
        } catch {
          /* 로그아웃 실패해도 세션은 다시 확인하고 로그인 화면으로 보낸다. */
        }
        try {
          await refresh();
        } catch {
          /* ignore */
        }
        router.replace("/login?reason=forbidden");
      })();
      return;
    }
    enforcedRef.current = false;
  }, [loading, user, isAllowed, refresh, router]);

  return gate;
}
