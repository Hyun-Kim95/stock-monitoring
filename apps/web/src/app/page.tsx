"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardPage } from "@/components/DashboardPage";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuthSession();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) return <div style={{ padding: 24 }}>세션 확인 중...</div>;
  if (!user) return null;
  return <DashboardPage />;
}
