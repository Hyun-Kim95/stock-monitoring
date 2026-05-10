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
    title: "관리자 설정",
    body: "왼쪽 메뉴에서 종목·테마·뉴스 수집 규칙을 관리합니다. 다음을 누르면 각 화면으로 이동하며, 무엇을 입력하면 되는지도 함께 안내합니다.",
    path: null,
    targetSelector: null,
  },
  {
    id: "stocks-nav",
    title: "종목 관리 메뉴",
    body: "대시보드 관심종목으로 올릴 종목을 여기서 등록·비활성합니다. 다음부터는 이 화면 안의 요약·폼·목록을 짚습니다.",
    path: "/admin/stocks",
    targetSelector: '[data-tour="admin-nav-stocks"]',
  },
  {
    id: "stocks-summary",
    title: "활성 종목 수",
    body: "현재 활성(대시보드에 보이는) 종목 개수와 상한입니다. 기본 최대 100개이며, 운영에서 시스템 설정 키 stocks.max_active 값으로 바꿀 수 있습니다. 상한에 도달하면 새로 활성화하거나 등록하는 요청이 거절됩니다.",
    path: "/admin/stocks",
    targetSelector: '[data-tour="admin-stocks-summary"]',
  },
  {
    id: "stocks-form",
    title: "종목 추가·수정 폼",
    body: "종목명 검색 후 결과를 누르면 코드·이름·시장·산업대분류가 채워집니다. 직접 넣을 때는 종목코드(신규 시 필수)·종목명·시장(KOSPI 등, 비우면 이후 자동 조회 가능)·검색 별칭(뉴스·검색용, 쉼표로 여러 개)·테마(신규는 쉼표 입력, 기존 테마는 아래 칩 선택)을 입력합니다. 수정 모드에서는 코드는 고정이고 테마 연결은 테마 관리 화면에서 바꿉니다.",
    path: "/admin/stocks",
    targetSelector: '[data-tour="admin-stocks-form"]',
  },
  {
    id: "stocks-table",
    title: "등록된 종목 목록",
    body: "행을 누르면 아래 폼에 그 종목이 불러와져 수정할 수 있습니다. 비활성은 대시보드에서 숨기고, 활성은 다시 표시합니다. 검색 별칭 열은 DB에 저장된 뉴스 검색용 별칭입니다.",
    path: "/admin/stocks",
    targetSelector: '[data-tour="admin-stocks-table"]',
  },
  {
    id: "themes-nav",
    title: "테마 관리 메뉴",
    body: "대시보드 필터에 쓰는 테마 묶음을 정의합니다. 다음 단계에서 추가 폼과 목록·종목 매핑을 설명합니다.",
    path: "/admin/themes",
    targetSelector: '[data-tour="admin-nav-themes"]',
  },
  {
    id: "themes-main",
    title: "테마 추가·매핑",
    body: "위쪽에서 테마명(필수)·설명을 넣고 생성합니다. 아래 목록에서 종목 편집을 누르면 체크박스로 이 테마에 넣을 종목을 고르고 매핑 저장을 누릅니다. 필터 입력으로 종목 목록을 좁힐 수 있습니다.",
    path: "/admin/themes",
    targetSelector: '[data-tour="admin-themes-main"]',
  },
  {
    id: "news-nav",
    title: "뉴스 규칙 메뉴",
    body: "기사 수집·표시 시 키워드 포함·제외 조건을 둡니다. 다음은 규칙 추가 폼 필드 설명입니다.",
    path: "/admin/news-rules",
    targetSelector: '[data-tour="admin-nav-news-rules"]',
  },
  {
    id: "news-form",
    title: "규칙 추가 폼",
    body: "범위: 전역이면 모든 종목 뉴스에 적용, 종목이면 아래에서 고른 종목에만 적용합니다. 포함 키워드는 기사에 반드시 있어야 매칭되고, 제외 키워드는 해당 문자열이 있으면 제외됩니다. 우선순위 숫자가 클수록 다른 규칙보다 먼저 적용됩니다. 비워도 되는 칸은 null로 저장됩니다.",
    path: "/admin/news-rules",
    targetSelector: '[data-tour="admin-news-rules-form"]',
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
