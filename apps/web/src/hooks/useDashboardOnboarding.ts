"use client";

import { useCallback, useEffect, useState } from "react";

export const DASHBOARD_ONBOARDING_STORAGE_KEY = "dashboard.onboarding.v1";

type OnboardingRecord = { done?: boolean };

export function readDashboardOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(DASHBOARD_ONBOARDING_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as OnboardingRecord;
    return Boolean(parsed?.done);
  } catch {
    return false;
  }
}

export function writeDashboardOnboardingDone(): void {
  try {
    localStorage.setItem(DASHBOARD_ONBOARDING_STORAGE_KEY, JSON.stringify({ done: true }));
  } catch {
    /* ignore */
  }
}

/**
 * 첫 방문 자동 투어 표시 여부 + 수동으로 다시 열기.
 */
export function useDashboardOnboarding() {
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (readDashboardOnboardingDone()) return;
    const id = window.setTimeout(() => setTourOpen(true), 500);
    return () => window.clearTimeout(id);
  }, []);

  const openTour = useCallback(() => {
    setTourOpen(true);
  }, []);

  const finishTour = useCallback(() => {
    writeDashboardOnboardingDone();
    setTourOpen(false);
  }, []);

  return { tourOpen, openTour, finishTour };
}
