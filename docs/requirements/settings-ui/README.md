---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-10
tags: [settings-ui, docs-set, gate1]
---

# 설정 UI — 문서 세트 (초기)

**단일 출처 PRD:** [`../settings-ui-prd.md`](../settings-ui-prd.md)  
**UI 고정:** [`../settings-ui-freeze.md`](../settings-ui-freeze.md)  
**구현 분할:** [`../settings-ui-implementation-plan.md`](../settings-ui-implementation-plan.md)

본 폴더는 Gate 1·운영·QA에서 바로 쓰도록 PRD를 **역할별로 쪼갠 산출물**이다. 세부 정책·코드 불일치 시 **항상 PRD를 먼저** 갱신한 뒤 이쪽을 동기화한다.

## 문서 목록

| 문서 | 용도 | 주 독자 |
|------|------|---------|
| [api-contract.md](./api-contract.md) | 설정 UI·관리 API 권한·엔드포인트·오류 코드 요약 | 프론트·백엔드 |
| [operations.md](./operations.md) | 환경 변수, 인증 모드, CSRF·출처, 장애 시 확인 순서 | 운영·배포 |
| [qa-checklist.md](./qa-checklist.md) | MVP·회귀 검증 항목(PRD §4~§7 정렬) | QA·릴리즈 담당 |

## PRD 절 매핑 (빠른 찾기)

| PRD | 세트 문서 |
|-----|-----------|
| §3 인증·As-Is | PRD 본문, [operations.md](./operations.md) |
| §4 기능 범위 | PRD, [qa-checklist.md](./qa-checklist.md), [UI Freeze](../settings-ui-freeze.md) |
| §6·§7 비기능·오류 | PRD, [api-contract.md](./api-contract.md), [operations.md](./operations.md) |
| §8 API 요약 | PRD, [api-contract.md](./api-contract.md) |
| §10 Q1~Q4 | PRD, [qa-checklist.md](./qa-checklist.md) Q4 등 |
| 구현 순서 | [settings-ui-implementation-plan.md](../settings-ui-implementation-plan.md) |

## 동기화 시 점검 (충돌 방지)

- 토큰·역할·CSRF 설명이 **PRD §0·§3·§7.4** 와 [operations.md](./operations.md) 첫 절에서 **같은 이야기**를 하는지.
- HTTP 코드표가 **PRD §7.2** · [api-contract.md](./api-contract.md) 오류 절 · [operations.md](./operations.md) 장애 표에서 **빠짐없이** 다뤄지는지(특히 **429·503·CSRF**).
- 엔드포인트 한 줄이라도 바뀌면 **라우트 파일 → api-contract → PRD §8** 순으로 반영.

## Phase·Gate 매핑 (참고)

| 단계 | 활용 문서 |
|------|-----------|
| Gate 1 (착수 전) | PRD 승인 + 본 세트로 계약·운영 전제 공유 |
| 구현 중 | `api-contract.md` ↔ 라우트 코드 동기화 |
| 배포 전 | `operations.md` 체크리스트 |
| DoD / 릴리즈 | `qa-checklist.md` |

## 디자인

**확정: 안 A** — 비교·기록 [`../../design/settings-ui-design-comparison.md`](../../design/settings-ui-design-comparison.md)

- 와이어: [`../../design/settings-ui-wireframes-option-a.md`](../../design/settings-ui-wireframes-option-a.md)
- 정적 목업: [`../../design/artifacts/settings-ui-mockup/`](../../design/artifacts/settings-ui-mockup/)
- Stitch(참고): [`../../design/settings-ui-stitch-option-b-cli.md`](../../design/settings-ui-stitch-option-b-cli.md)

## 로드맵 문서

PRD §4.6·§11에 따른 **추후** 산출물(별도 작성 시 본 README에 행 추가):

- OWNER/ADMIN 전용 문의 목록 API·화면
- 감사 로그
- 고급 RBAC

## Vault

- Hub·대시보드 링크는 상위 [`../README.md`](../README.md)를 따른다.
