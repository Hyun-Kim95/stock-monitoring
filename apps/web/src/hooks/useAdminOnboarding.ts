"use client";

import { useCallback, useEffect, useState } from "react";

export const ADMIN_ONBOARDING_STORAGE_KEY = "admin.onboarding.v1";

type OnboardingRecord = { done?: boolean };

export function readAdminOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(ADMIN_ONBOARDING_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as OnboardingRecord;
    return Boolean(parsed?.done);
  } catch {
    return false;
  }
}

export function writeAdminOnboardingDone(): void {
  try {
    localStorage.setItem(ADMIN_ONBOARDING_STORAGE_KEY, JSON.stringify({ done: true }));
  } catch {
    /* ignore */
  }
}

/**
 * 설정 UI 영역 첫 방문 자동 투어 + 수동으로 다시 열기.
 * @param enabled 세션·권한이 준비된 뒤에만 자동 오픈(로딩 중에는 false 권장).
 */
export function useAdminOnboarding(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (readAdminOnboardingDone()) return;
    const id = window.setTimeout(() => setTourOpen(true), 500);
    return () => window.clearTimeout(id);
  }, [enabled]);

  const openTour = useCallback(() => {
    setTourOpen(true);
  }, []);

  const finishTour = useCallback(() => {
    writeAdminOnboardingDone();
    setTourOpen(false);
  }, []);

  return { tourOpen, openTour, finishTour };
}
