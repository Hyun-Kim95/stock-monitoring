---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-12
tags: [platform-operator, operations]
related_prd: ../platform-operator-site-prd.md
status: draft
---

# 플랫폼 운영자 사이트 — 운영 메모

기준: [`../platform-operator-site-prd.md`](../platform-operator-site-prd.md) §0·§2·§5·§6·§7·§8·§9 및 루트 `README.md`.

## 환경 변수 (초기 체크리스트)

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | 동일 DB — 테넌트·사용자·문의·설정 SSOT |
| **`users.is_platform_admin`** (PostgreSQL) | Prisma `User.isPlatformAdmin`. 프로덕션에서 운영자에게만 `true` 부여 — 아래 절차 참고. |
| `PLATFORM_API_TOKEN` | **선택.** 도입 시에만 플랫폼 전용 자동화 경로에 사용. **`ADMIN_API_TOKEN`과 혼용 금지**(PRD §0). |
| `WEB_PUBLIC_BASE_URL` / `CORS_ORIGIN` | 플랫폼 웹을 제품 웹과 **같은 출처 정책**으로 둘지, 서브도메인 분리 시 **CSRF·쿠키** 재검토 |
| `NEXT_PUBLIC_*` (플랫폼 전용 웹 앱을 둘 때) | API 베이스 URL 등 — **설정 UI와 동일하게** 빌드 타임 노출 범위를 최소화한다. |
| 기존 OAuth·세션 | 제품과 동일 쿠키명·만료 정책을 쓰는 경우가 기본 — 구현 시 `auth-session`과 정합 확인 |

**금지:** 플랫폼 라우트에서 `ADMIN_API_TOKEN` Bearer만으로 쓰기 허용(설정 UI `adminPre`와의 OR 혼동 방지).

## CSRF·출처 (제품 API와 공유 시)

플랫폼 운영자 UI가 **동일 Fastify 앱**에 붙고 비안전 메서드에 **동일 CSRF 미들웨어**를 탄다면, 설정 UI와 **동일한 증상·환경 변수**가 적용된다. 상세 수치·메시지는 **[`../settings-ui/operations.md`](../settings-ui/operations.md)** 를 SSOT로 두고, 아래만 플랫폼 체크리스트에 복사한다.

| 증상 | 조치 요약 |
|------|-----------|
| **403** `CSRF_REJECTED` | `Origin`/`Referer`가 허용 목록에 있는지, 리버스 프록시가 헤더를 보존하는지 |
| **503** `CSRF_CONFIG` | `WEB_PUBLIC_BASE_URL` / `CORS_ORIGIN` 미설정·불일치 |

**서브도메인 분리**(예: `ops.example.com` ↔ `app.example.com`) 시: 쿠키 `SameSite`·도메인 속성·CSRF 허용 목록을 **플랫폼 전용으로 재합의**하고 본 절에 표를 추가한다(미기재 시 구현 착수 후 보완).

## 보안 강화 A-02 (PRD §4.4)

운영 환경에서는 **2FA 또는 IP 허용 목록** 중 최소 하나 적용을 권장한다. 구현·벤더가 정해지면 본 절에 링크·절차를 추가한다.

## 전역 운영자 부여·회수 (운영 절차)

1. **저장 형태:** `users.is_platform_admin` BOOLEAN 기본 `false` (마이그레이션 `20260512120000_platform_operator_audit` 등).
2. **프로덕션**에서는 DB 직접 수정 또는 관리 스크립트로 **한 명(또는 합의된 소수)** 만 플래그를 켠다.  
   예: `UPDATE users SET is_platform_admin = true WHERE email = 'ops@example.com';`
3. **회수**(퇴사·권한 박탈) 시 플래그 즉시 `false` → 다음 요청부터 **`/platform/*` 403**, 웹 `/platform/*`는 홈으로 리다이렉트.
4. 변경 이력은 `platform_audit_logs` 및 운영 티켓에 **누가·언제·사유**를 남긴다.

## 감사 로그·쓰기 원자성 (§8.7)

**확정:** **(a)** 답변 생성·설정 갱신은 **`PlatformAuditLog` INSERT를 비즈니스 쓰기와 동일 Prisma 트랜잭션**에서 수행한다.  
민감 **조회**(사용자 단건·문의 단건)는 감사를 **직후 별도 INSERT**로 남겨 가용성을 우선한다 — [api-contract.md](./api-contract.md) §9 확정 표와 동일.

## 배포 전 체크리스트

1. 플랫폼 API가 **`/platform` (또는 합의 prefix)** 로만 노출되고 `adminPre`와 분리되었는지.
2. 스테이징에서 **일반 `MEMBER`·테넌트 `ADMIN`만** 세션으로 `/platform/*` 호출 시 **403**인지.
3. **CSRF** 비안전 메서드가 제품과 동일 정책인지(출처·쿠키).
4. **429** 상한이 운영 자동화와 충돌하지 않는지([api-contract.md](./api-contract.md)와 코드 일치); 응답 `error.code`는 제품과 **`RATE_LIMIT`** 통일.
5. **2FA 또는 IP 제한**(PRD §4.4 A-02) 운영 환경 적용 여부.
6. 플랫폼에서 `POST`/`PUT` 시 **CSRF** 재현 테스트(위 절).

## 장애·메시지 대응 (요약)

| 증상 | 우선 확인 |
|------|-----------|
| 플랫폼 UI **403** | 전역 운영자 플래그·세션 사용자 일치 |
| **401** 반복 | 세션 만료; 플랫폼 전용 Bearer 만료(도입 시) |
| 설정 값이 **예상과 다름** | `/settings`와 플랫폼 **이중 진입점** — 감사 출처 `SETTINGS_UI` vs `PLATFORM_CONSOLE`(PRD §0) |
| **409** on 설정 저장 | 동시 편집; 새로고침 후 재시도 |
| 건강도 **항상 빈 값** | `StockQuoteHistory`는 테넌트 FK 없음 — 종목 코드 매핑·상류 타임아웃(503) PRD §8.8 |
| 답변·설정 저장 시 **403 CSRF_*** | 설정 UI와 동일 — `WEB_PUBLIC_BASE_URL` 등(위 CSRF 절) |
| **429** `RATE_LIMIT` | 동일 IP·비GET/검색 폭주 — `registerWriteRateLimit` 등과 수치 일치 확인 |

## 합의 참조

- 테넌트 설정 UI: [`../settings-ui-prd.md`](../settings-ui-prd.md), [`../settings-ui/operations.md`](../settings-ui/operations.md)

## 변경 이력 (본 문서)

| 일자 | 내용 |
|------|------|
| 2026-05-11 | 초안. |
| 2026-05-11 | CSRF·서브도메인·A-02·`RATE_LIMIT`·배포 체크 6번·장애 표 보강, §7 기준 추가. |
| 2026-05-11 | 감사 트랜잭션 절에 **PRD §9 추천 (a)** 명시. |
| 2026-05-12 | `is_platform_admin` 컬럼·부여 SQL 예시·감사 (a) 확정·조회 감사 분리 반영. |
