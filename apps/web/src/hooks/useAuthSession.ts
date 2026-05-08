"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet } from "@/lib/api-client";

export type SessionUser = {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export function useAuthSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ user: SessionUser }>("/auth/me");
      setUser(data.user);
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
