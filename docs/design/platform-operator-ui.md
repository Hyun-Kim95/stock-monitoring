---
type: design
project: stockMonitoring
updated_at: 2026-05-12
related_prd: ../requirements/platform-operator-site-prd.md
---

# 플랫폼 운영자 UI — 와이어·상태 (안 A 채택)

## §11 디자인 게이트 (요약)

| 항목 | 결정 |
|------|------|
| **안 A** | 제품 **사용자 대시보드·`(admin)` 설정 셸**과 동일 계열: `admin-shell` / `admin-sidebar` / `admin-main` / `panel` / `btn` (`apps/web/src/app/globals.css`). |
| **안 B (Stitch)** | 본 릴리스 범위에서는 **생략**. 사유: PRD에서 사용자 UI 일관을 1차 목표로 확정했고, 동일 토큰·레이아웃을 재사용하면 이중 시안 대비 이득이 제한적임. |
| **HUMAN** | 구현은 본 문서 + PRD §9 확정·[`platform-operator-site/api-contract.md`](../requirements/platform-operator-site/api-contract.md)를 따른다. |

## 정보 구조 (IA)

| 경로 | 목적 |
|------|------|
| `/platform/tenants` | 테넌트 목록·검색·페이지네이션 (D-01) |
| `/platform/tenants/[tenantId]` | 테넌트 허브: 문의·설정·카탈로그·건강도 링크 |
| `/platform/users` | 전역 사용자 검색 (S-01) |
| `/platform/users/[userId]` | 프로필·멤버십·OAuth 요약 (S-02) |
| `/platform/tenants/[tenantId]/inquiries` | 테넌트 문의 목록·필터 (S-04) |
| `/platform/inquiries/[inquiryId]` | 문의 상세·답변 스레드·운영자 답변 (S-05) |
| `/platform/tenants/[tenantId]/settings` | `SystemSetting` 목록·편집 (D-02) |
| `/platform/tenants/[tenantId]/catalog` | 종목·테마·규칙 수 집계 (D-03) |
| `/platform/tenants/[tenantId]/quote-health` | 활성 종목별 최근 시세 기록 시각 (D-04) |

## 반응형

- **데스크톱:** 사이드바 고정 + 본문 스크롤(관리 설정과 동일).
- **모바일:** 사이드바는 세로 스택; 표는 가로 스크롤(`overflow-x: auto`) 허용.

## 다크모드

- 루트 `ThemeToggle` + `localStorage` 키 `sm-theme` — 제품 전역과 동일 (규칙 40).

## 화면별 상태 UI

| 화면 | 기본 | 로딩 | 빈 | 오류 | 권한 |
|------|------|------|-----|------|------|
| 공통 레이아웃 | 네비·푸터 | 세션 확인 중 | — | — | 비로그인 → `/login`; 로그인·비운영자 → `/` |
| 테넌트 목록 | 표 15건 | 문구 | “테넌트 없음” | 배너 | — |
| 사용자 검색 | 입력·표 | 검색 중 | q 없음: 안내 | 400/429 등 | truncated 배너 |
| 문의 목록 | 필터·표 | 로딩 | 목록 없음 | 배너 | — |
| 문의 상세 | 본문·답변 | 로딩 | — | 404 배너 | — |
| 설정 | 키·값 표 | 로딩 | 설정 없음 | 409 동시성 메시지 | — |

## 테이블 UX (규칙 30)

- 필터·검색은 **표 위쪽**.
- **페이지당 15건** 기본; API `pageSize` 클램프와 정합.
- **하단 중앙** 페이지네이션, 이전/다음은 **꺽쇠** 표현.
- 검색이 있는 화면: 검색 실행 컨트롤 **오른쪽**에 **초기화**(필터·페이지 1로 즉시 반영).
