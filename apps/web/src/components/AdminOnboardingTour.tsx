"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

type AdminTourStep = {
  id: string;
  title: string;
  body: string;
  path: string | null;
  targetSelector: string | null;
};

const STEPS: AdminTourStep[] = [
  {
    id: "welcome",
    title: "설정 UI 안내",
    body: "왼쪽 메뉴에서 종목·테마·뉴스 수집 규칙을 관리합니다. 다음을 누르면 메뉴별로 무엇을 하면 되는지 짧게 안내합니다.",
    path: null,
    targetSelector: null,
  },
  {
    id: "stocks",
    title: "종목 관리",
    body: "관심종목을 등록·비활성합니다. 활성 상한은 기본 100개이며, 가까우면 추가가 제한될 수 있습니다. 종목명 검색으로 자동 채우거나 직접 입력하고, 검색 별칭·테마는 쉼표·칩으로 넣습니다. 목록에서 수정하고, 테마 매핑은 테마 관리에서 합니다.",
    path: "/settings/stocks",
    targetSelector: '[data-tour="admin-nav-stocks"]',
  },
  {
    id: "themes",
    title: "테마 관리",
    body: "대시보드 필터에 쓰는 테마 묶음을 만듭니다. 테마명(필수)·설명을 넣고 생성하고, 목록에서 종목 편집으로 체크한 뒤 매핑 저장하면 해당 테마에 종목이 묶입니다. 필터로 종목 목록을 좁힐 수 있습니다.",
    path: "/settings/themes",
    targetSelector: '[data-tour="admin-nav-themes"]',
  },
  {
    id: "news-rules",
    title: "뉴스 규칙",
    body: "기사 수집·표시에 쓸 포함·제외 키워드 규칙을 둡니다. 범위가 전역이면 모든 종목에, 종목이면 선택한 종목에만 적용됩니다. 포함 키워드는 기사에 있어야 매칭되고, 제외 키워드가 있으면 해당 기사는 빠집니다. 우선순위 숫자가 클수록 먼저 적용됩니다.",
    path: "/settings/news-rules",
    targetSelector: '[data-tour="admin-nav-news-rules"]',
  },
  {
    id: "done",
    title: "안내 끝",
    body: "왼쪽 위「사용법」으로 이 안내를 다시 볼 수 있고, 아래「← 대시보드로 돌아가기」로 메인 화면으로 돌아갑니다.",
    path: null,
    targetSelector: '[data-tour="admin-back-dashboard"]',
  },
];

function spotlightClipPath(rect: DOMRect): string {
  const pad = 8;
  const t = rect.top - pad;
  const l = rect.left - pad;
  const r = rect.right + pad;
  const b = rect.bottom + pad;
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`;
}

export function AdminOnboardingTour({
  open,
  onFinish,
}: {
  open: boolean;
  onFinish: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastStep = stepIndex >= STEPS.length - 1;

  useEffect(() => {
    if (!open) setStepIndex(0);
  }, [open]);

  const measure = useCallback(() => {
    const step = STEPS[stepIndex];
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
  }, [stepIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = STEPS[stepIndex];
    if (step.path && pathname !== step.path) {
      router.push(step.path);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => measure());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, stepIndex, pathname, router, measure]);

  useLayoutEffect(() => {
    if (!open) return;
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
    const t = window.setTimeout(() => measure(), 120);
    return () => window.clearTimeout(t);
  }, [open, measure, pathname]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.querySelector<HTMLElement>("button")?.focus();
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
    else setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const prev = () => setStepIndex((i) => Math.max(0, i - 1));

  if (!open || typeof document === "undefined") return null;

  const step = STEPS[stepIndex];
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
          zIndex: 2100,
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
            zIndex: 2101,
          }}
        />
      ) : null}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-tour-title"
        style={{
          position: "fixed",
          zIndex: 2102,
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
        <div id="admin-tour-title" style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          {step.title}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.55, color: "var(--muted-foreground)" }}>{step.body}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {stepIndex + 1} / {STEPS.length}
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
