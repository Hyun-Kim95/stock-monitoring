"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet } from "@/lib/api-client";

export type SessionUser = {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  /** `GET /auth/me` — DB `User.isPlatformAdmin` */
  isPlatformOperator: boolean;
};

export function useAuthSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ user: SessionUser & { isPlatformOperator?: boolean } }>("/auth/me");
      const u = data.user;
      setUser({
        userId: u.userId,
        email: u.email,
        displayName: u.displayName,
        tenantId: u.tenantId,
        role: u.role,
        isPlatformOperator: Boolean(u.isPlatformOperator),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading, refresh };
}
