---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-12
tags: [platform-operator, docs-set, gate1]
---

# 플랫폼 운영자 사이트 — 문서 세트 (초기)

**단일 출처 PRD:** [`../platform-operator-site-prd.md`](../platform-operator-site-prd.md)

본 폴더는 Gate 1·2·운영·QA에서 바로 쓰도록 PRD를 **역할별로 분리한 초기 산출물**이다. 세부 정책·코드와 불일치하면 **항상 PRD를 먼저** 갱신한 뒤 이 세트를 동기화한다.

## 문서 목록

| 문서 | 용도 | 주 독자 |
|------|------|---------|
| [api-contract.md](./api-contract.md) | 라우트 접두사·권한·엔드포인트 초안·HTTP·에러 코드 | 프론트·백엔드 |
| [operations.md](./operations.md) | 환경 변수, 권한 부여 절차, 감사·장애 대응 | 운영·배포 |
| [qa-checklist.md](./qa-checklist.md) | MVP·엣지·회귀 검증(PRD §4·§7·§8·§10 정렬) | QA·릴리즈 담당 |

## PRD 절 매핑 (빠른 찾기)

| PRD | 세트 문서 |
|-----|-----------|
| §0 메타·정책 정합 | PRD, [operations.md](./operations.md), [api-contract.md](./api-contract.md) 인증 절 |
| §1 목표·비목표 | PRD(단일); 세트는 범위 오해 시 PRD만 수정 |
| §2·§6 역할·API 원칙 | PRD, [api-contract.md](./api-contract.md) |
| §3 As-Is(세션 1멤버십 등) | PRD, [qa-checklist.md](./qa-checklist.md) 다중 멤버십·세션 정합 |
| §4 기능(S·D·A) | PRD, [api-contract.md](./api-contract.md) 엔드포인트·로드맵 표, [qa-checklist.md](./qa-checklist.md) |
| §5 개인정보·고위험 | PRD, [operations.md](./operations.md), [qa-checklist.md](./qa-checklist.md) |
| §7·§8 상태·엣지·오류 | PRD, [api-contract.md](./api-contract.md) 오류·페이지네이션·`RATE_LIMIT`, [qa-checklist.md](./qa-checklist.md) |
| §9 정책 확정 | PRD §9·[api-contract.md](./api-contract.md)·[operations.md](./operations.md)·[qa-checklist.md](./qa-checklist.md) 동기(2026-05-12). |
| §10 MVP 수용 | [qa-checklist.md](./qa-checklist.md) |
| §11 디자인 게이트 | [`docs/design/platform-operator-ui.md`](../../design/platform-operator-ui.md) — 안 A 채택·안 B 생략 사유. |
| §12 변경 이력 | PRD 단독(세트 README 하단 “본 세트” 이력과 역할 분리) |

## 동기화 시 점검 (충돌 방지)

- 플랫폼 라우트가 **`adminPre`·`ADMIN_API_TOKEN`과 OR로 묶이지 않았는지**(PRD §0·§6).
- 테넌트 스코프 요청에 **`tenantId`가 경로 또는 쿼리로 명시**되는지(세션 `tenantId`만 사용하지 않는지).
- HTTP **401/403/404/409/429/500/503** 및 **403/503 `CSRF_*`**(플랫폼 웹이 제품 API와 동일 CSRF 미들웨어를 탈 때)가 PRD §7.2·§8·[api-contract.md](./api-contract.md)·[operations.md](./operations.md)에서 **동일 스토리**인지.
- **429** 응답의 `error.code`가 제품과 **`RATE_LIMIT`** 로 통일됐는지(PRD §7.2).
- `SystemSetting` 갱신 시 **409·낙관적 잠금** 여부가 PRD §9 결정과 코드·계약이 일치하는지.
- 엔드포인트·쿼리 파라미터가 바뀌면 **라우트 구현 → api-contract → PRD(필요 시)** 순으로 반영.

## 관련 제품 문서

- 테넌트 스코프 설정 UI: [`../settings-ui-prd.md`](../settings-ui-prd.md), [`../settings-ui/README.md`](../settings-ui/README.md)

## Phase·Gate 매핑 (참고)

| 단계 | 활용 문서 |
|------|-----------|
| Gate 1 | PRD 승인 + 본 README로 범위·계약 공유 |
| Gate 2 | [api-contract.md](./api-contract.md) 확정 후 프론트·백 병렬 착수 |
| 배포 전 | [operations.md](./operations.md) |
| DoD / 릴리즈 | [qa-checklist.md](./qa-checklist.md), PRD §10 |

## 변경 이력 (본 세트)

| 일자 | 내용 |
|------|------|
| 2026-05-11 | 초기 세트 작성 — README, api-contract(초안), operations, qa-checklist. |
| 2026-05-11 | 누락·충돌 보완 — PRD §0 범위·§7.2 `RATE_LIMIT`, README 매핑 §1·§3·§12·CSRF·500, api-contract 테넌트 경로 권장·전역 경로 표·replies·로드맵·오류 코드 정합, operations CSRF, qa A-02·D-03·§5·`RATE_LIMIT`. |
| 2026-05-11 | PRD §9·api-contract **미확정 추천안** 동기, `/auth/me` 확장 권장 반영, operations 감사 (a) 추천 명시, README §9 행. |
| 2026-05-12 | §9 확정 반영·§11 디자인 문서 링크·README 매핑 갱신. |
