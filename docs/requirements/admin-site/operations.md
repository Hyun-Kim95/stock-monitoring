---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-10
tags: [admin, operations]
related_prd: ../admin-site-prd.md
---

# 관리자 기능 — 운영·배포 메모

PRD [`admin-site-prd.md`](../admin-site-prd.md) §3·§6·§9 및 루트 `README.md`와 정렬한다.

## 환경 변수 (관리·보안)

| 변수 | 용도 |
|------|------|
| `ADMIN_API_TOKEN` | 설정 시 관리 쓰기에 `Authorization: Bearer …` 허용; 미설정 시 **세션+OWNER/ADMIN만** 유효 |
| `WEB_PUBLIC_BASE_URL` | CSRF 허용 출처 집합에 포함 (`registerCsrfOriginProtection`) |
| `CORS_ORIGIN` | 쉼표 구분 추가 출처 |
| `DATABASE_URL` | 테넌트 데이터 SSOT |
| `NEXT_PUBLIC_API_URL` | 웹이 붙는 API 베이스 URL — **쿠키 세션** 사용 시 웹·API **출처·동일 사이트 정책**과 맞춰야 함(교차 도메인이면 CORS·쿠키 설정 추가 검토) |

**주의:** 루트 `README`의 `NEXT_PUBLIC_ADMIN_TOKEN`은 대시보드 등 안내용일 수 있으나, 공용 웹 `api-client`는 **`Authorization`을 자동 부착하지 않는다.** 브라우저 관리 화면은 **로그인 세션 + `OWNER`/`ADMIN`** 이 기본이다. 운영 문서에서 **`ADMIN_API_TOKEN`(서버)** 과 **`NEXT_PUBLIC_ADMIN_TOKEN`(클라이언트 빌드 노출)** 을 혼동하지 않도록 구분한다.

## 배포 전 체크리스트

1. **무단 변경 방지:** 스테이징/프로덕션에서 `ADMIN_API_TOKEN` 설정 **또는** 세션 기반 관리만으로 충분한지 확인.
2. **CSRF:** `WEB_PUBLIC_BASE_URL`·`CORS_ORIGIN`으로 실제 웹 출처가 커버되는지 확인. 미설정 시 상태 변경 요청이 **503 `CSRF_CONFIG`** 로 실패할 수 있다.
3. **HTTPS:** 프로덕션에서 쿠키·SameSite 정책과 함께 검토.
4. **쓰기 레이트 리밋:** IP당 분당 상한 초과 시 **429** — 자동화 스크립트는 연속 POST 자제.

## 장애·메시지 대응 (요약)

| 증상 | 우선 확인 |
|------|-----------|
| 관리 저장 시 **403** `CSRF_REJECTED` | 브라우저 출처가 허용 목록에 있는지, 리버스 프록시가 `Origin`/`Referer`를 깨지 않는지 |
| **503** `CSRF_CONFIG` | `WEB_PUBLIC_BASE_URL` / `CORS_ORIGIN` 미설정 또는 빈 집합 |
| **401** 반복 | 세션 만료·로그인 필요; Bearer만 쓰는 자동화는 테넌트 필요 API와 충돌하지 않는지(PRD §7.4) |
| **429** `RATE_LIMIT` | 동일 IP에서 분당 **비GET 요청** 상한 초과 — 구현 기본값은 대략 **120건 / 60초**(코드 `registerWriteRateLimit`, 변경 시 본 문서·PRD 동기화) |
| **500**·비정상 본문 | Bearer만 통과·세션 없는 관리 쓰기 등 예외 경로 — PRD §0·§7.4·서버 로그 확인 |
| 종목 검색 **502** | 네이버 자동완성 상류 |

## 합의 참조

- 활성 종목 상한: [`DECISION_LOG.md`](../../DECISION_LOG.md) **D-005**, 설정 키 `stocks.max_active`
