---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-10
tags: [settings-ui, ui-freeze, option-a]
status: frozen
design_ref: ../../design/settings-ui-design-comparison.md
---

# 설정 UI 고정 (Freeze)

**디자인 기준:** 안 A 확정 — [`../design/settings-ui-design-comparison.md`](../design/settings-ui-design-comparison.md)  
**시각·IA 근거:** [`../design/settings-ui-wireframes-option-a.md`](../design/settings-ui-wireframes-option-a.md) · 정적 목업 [`../design/artifacts/settings-ui-mockup/index.html`](../design/artifacts/settings-ui-mockup/index.html)  
**제품·오류 근거:** [`settings-ui-prd.md`](./settings-ui-prd.md) §4~§7

본 문서는 **구현 착수 이후** 설정 UI의 정보 구조·핵심 패턴을 바꾸지 않기 위한 **고정선(Freeze)** 이다. 변경이 필요하면 **PRD 개정 + 본 문서 개정 + 디자인 재승인** 순으로 한다.

---

## 1. 고정 — 정보 구조 (IA)

| 순서 | 라벨 | 경로 | 비고 |
|------|------|------|------|
| 1 | 종목 관리 | `/settings/stocks` | 기존과 동일 |
| 2 | 테마 관리 | `/settings/themes` | 기존과 동일 |
| 3 | 뉴스 규칙 | `/settings/news-rules` | 기존과 동일 |
| 4 | 런타임 설정 | `/settings/settings` | **사이드 네비에 반드시 포함**(현 `AdminNav`에 없으면 구현으로 추가) |
| 보조 | 문의하기 | `/settings/inquiries` (예전 `/contact` 리다이렉트) | **1~4와 동등한 주 네비 항목으로 두지 않음** — 푸터·보조 링크·별도 섹션 등으로 배치(와이어·목업과 정합) |

**셸:** `apps/web/src/app/(admin)/layout.tsx` — 사이드바 + `admin-main`, 브랜드·이메일·대시보드 복귀·로그아웃·`AdminNav` 유지. **980px** 기준 반응형은 [`mobile-dashboard-responsive.md`](./mobile-dashboard-responsive.md) 및 PRD §4.1.

---

## 2. 고정 — 화면별 UI 골격

### `/settings/stocks`

- 상단 요약: **활성 n / 최대 m** (서버 `stocks.max_active`와 일치).
- **상단 패널:** 검색·등록·수정 폼(기존 필드 유지).
- **하단 패널:** 등록된 종목 **테이블** + 행별 활성/비활성.
- **상태:** 기본·로딩·빈·오류 — PRD §7, 메시지는 `error.message` 우선(JSON stringify만 노출 지양).

### `/settings/themes` · `/settings/news-rules` · `/settings/settings`

- **패널 + 폼 + 목록/표** 구조 유지.
- 설정: 키 선택 후 값 갱신 패턴 유지.

---

## 3. 고정 — 토큰·테마

- 색·타이포·보더는 **`apps/web/src/app/globals.css`** 의 `--background`, `--foreground`, `--border`, `--muted-foreground`, `--primary`, `--destructive` 등 **기존 토큰**을 우선한다.
- **라이트/다크:** 앱 전역 정책과 동일(별도 설정 UI 전용 팔레트 신설 금지).

---

## 4. 의도적 보류 (Freeze에 포함하지 않음)

| 항목 | 처리 |
|------|------|
| **테이블 15건·페이지네이션·초기화 버튼** | PRD Q4 — [`settings-ui-implementation-plan.md`](./settings-ui-implementation-plan.md) **Track P** 에서만 범위 확정 후 적용. 고정 전에는 **전체 스크롤 목록 유지 가능**. |
| **모바일 사이드바** | 와이어: 축소 vs 햄버거 **택일** — Track 0 또는 Track 1에서 한 가지로 결정 후 본 문서에 한 줄 보강. |

---

## 5. 변경 절차 (Freeze 이후)

1. 이슈/PR에 **Freeze 위반 여부** 명시  
2. PRD·본 문서·(필요 시) 와이어·목업 갱신  
3. 디자인 게이트 재합의(`.cursor/rules/65-design-gate.mdc`)

---

## 개정 이력

| 일자 | 요약 |
|------|------|
| 2026-05-10 | 최초 — 안 A 확정 후 UI 고정선 정의 |
