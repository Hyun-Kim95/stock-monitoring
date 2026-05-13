"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TourStep = {
  id: string;
  title: string;
  body: string;
  targetSelector: string | null;
  minWidth?: number;
  maxWidth?: number;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "관심종목 모니터링",
    body: "이 화면에서 관심종목 시세·차트·뉴스를 한 번에 볼 수 있습니다. 잠시만 따라와 주세요.",
    targetSelector: null,
  },
  {
    id: "desktop-filters",
    title: "상단 필터",
    body: "시장·세션·NXT·등락률 알림 조건을 여기서 바꿀 수 있습니다. 줄이 길어지면 아래 줄로 이어집니다.",
    targetSelector: "[data-tour=\"desktop-toolbar\"]",
    minWidth: 980,
  },
  {
    id: "mobile-filter",
    title: "필터",
    body: "좁은 화면에서는 이 버튼으로 동일한 필터·알림 설정을 열 수 있습니다.",
    targetSelector: "[data-tour=\"mobile-filter\"]",
    maxWidth: 979,
  },
  {
    id: "search",
    title: "종목 찾기",
    body: "종목명·코드로 목록을 좁힙니다. 오른쪽 초기화로 필터를 한 번에 되돌릴 수 있습니다.",
    targetSelector: "[data-tour=\"search-row\"]",
  },
  {
    id: "theme-settings",
    title: "화면·설정",
    body: "테마(라이트/다크), 설정 UI 링크가 여기 있습니다.",
    targetSelector: "[data-tour=\"theme-settings\"]",
  },
  {
    id: "watchlist",
    title: "관심종목",
    body: "표에서 종목을 누르면 선택되고 뉴스가 바뀝니다. 좁은 화면에서는「차트 보기」로 가격 차트 패널을 열 수 있습니다. 컬럼·종목 추가는 제목 오른쪽 버튼입니다.",
    targetSelector: "[data-tour=\"watchlist-panel\"]",
  },
  {
    id: "chart",
    title: "가격 차트",
    body: "봉 단위·봉 개수를 바꿀 수 있습니다. 좁은 화면에서는 관심종목과 뉴스 사이 패널로 열립니다.",
    targetSelector: "[data-tour=\"chart-area\"]",
  },
  {
    id: "news",
    title: "관련 뉴스",
    body: "선택한 종목 기준 최근 기사입니다. 제목을 누르면 새 탭에서 열립니다.",
    targetSelector: "[data-tour=\"news-panel\"]",
  },
  {
    id: "done",
    title: "준비 완료",
    body: "나중에도 헤더 제목 옆「사용법」버튼으로 이 안내를 다시 볼 수 있습니다.",
    targetSelector: null,
  },
];

function useIsDesktop980(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 980px)");
    const fn = () => setDesktop(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return desktop;
}

function filterSteps(isDesktop: boolean, skipChartStep: boolean): TourStep[] {
  return STEPS.filter((s) => {
    if (s.minWidth != null && !isDesktop) return false;
    if (s.maxWidth != null && isDesktop) return false;
    if (skipChartStep && s.id === "chart") return false;
    return true;
  });
}

/** 뷰포트 기준 px — even-odd로 바깥 사각형에서 구멍 제거 */
function spotlightClipPath(rect: DOMRect): string {
  const pad = 8;
  const t = rect.top - pad;
  const l = rect.left - pad;
  const r = rect.right + pad;
  const b = rect.bottom + pad;
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`;
}

export function DashboardOnboardingTour({
  open,
  onFinish,
  skipChartStep = false,
}: {
  open: boolean;
  onFinish: () => void;
  /** 모바일에서 차트 패널이 닫혀 있으면 chart 단계 생략(DOM에 타깃 없음) */
  skipChartStep?: boolean;
}) {
  const isDesktop = useIsDesktop980();
  const steps = useMemo(() => filterSteps(isDesktop, skipChartStep), [isDesktop, skipChartStep]);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastStep = stepIndex >= steps.length - 1;

  useEffect(() => {
    if (!open) setStepIndex(0);
  }, [open]);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
  }, [steps.length]);

  const measure = useCallback(() => {
    const step = steps[stepIndex];
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (!(el instanceof HTMLElement)) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    setTargetRect(el.getBoundingClientRect());
  }, [steps, stepIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScrollOrResize = () => measure();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => measure(), 100);
    return () => window.clearTimeout(t);
  }, [open, measure, isDesktop]);

  useEffect(() => {
    if (!open) return;
    const el = cardRef.current?.querySelector<HTMLElement>("button");
    el?.focus();
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onFinish]);

  const next = () => {
    if (lastStep) onFinish();
    else setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const prev = () => setStepIndex((i) => Math.max(0, i - 1));

  if (!open || typeof document === "undefined") return null;

  const step = steps[stepIndex];
  if (!step) return null;

  const ringPad = 6;
  const cardW = Math.min(360, Math.max(280, typeof window !== "undefined" ? window.innerWidth - 24 : 360));

  let cardTop = 80;
  let cardLeft = 12;
  if (targetRect && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferBelow = targetRect.bottom + 220 < vh;
    cardTop = preferBelow ? targetRect.bottom + 12 : Math.max(12, targetRect.top - 200);
    cardLeft = Math.max(12, Math.min(targetRect.left, vw - cardW - 12));
  } else if (typeof window !== "undefined") {
    cardLeft = Math.max(12, (window.innerWidth - cardW) / 2);
    cardTop = Math.max(12, (window.innerHeight - 280) / 2);
  }

  const clipPath = targetRect ? spotlightClipPath(targetRect) : undefined;

  const ui = (
    <>
      <button
        type="button"
        aria-label="투어 닫기(건너뛰기와 동일)"
        onClick={() => onFinish()}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "default",
          background: "color-mix(in oklab, #000 55%, transparent)",
          clipPath,
        }}
      />
      {targetRect ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: targetRect.left - ringPad,
            top: targetRect.top - ringPad,
            width: targetRect.width + ringPad * 2,
            height: targetRect.height + ringPad * 2,
            borderRadius: 10,
            border: "2px solid color-mix(in oklab, var(--primary) 80%, transparent)",
            pointerEvents: "none",
            zIndex: 2001,
          }}
        />
      ) : null}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-tour-title"
        style={{
          position: "fixed",
          zIndex: 2002,
          top: cardTop,
          left: cardLeft,
          width: cardW,
          maxHeight: "min(70dvh, 420px)",
          overflow: "auto",
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
          boxShadow: "0 12px 40px color-mix(in oklab, #000 35%, transparent)",
        }}
      >
        <div id="dashboard-tour-title" style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          {step.title}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.55, color: "var(--muted-foreground)" }}>{step.body}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {stepIndex + 1} / {steps.length}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => onFinish()}>
              건너뛰기
            </button>
            <button type="button" className="btn btn-secondary" disabled={stepIndex === 0} onClick={prev}>
              이전
            </button>
            <button type="button" className="primary" onClick={next}>
              {lastStep ? "완료" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(ui, document.body);
}
