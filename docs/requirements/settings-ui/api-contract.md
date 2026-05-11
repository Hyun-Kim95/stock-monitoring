---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-10
tags: [settings-ui, api, contract]
related_prd: ../settings-ui-prd.md
---

# 설정 UI·관리 API 계약 요약

**SSOT:** Fastify 라우트 구현(`apps/api/src/routes/*.ts`). 본 문서는 [`settings-ui-prd.md`](../settings-ui-prd.md) §7·§8과 동일 선상의 **업무용 요약**이다.

## 인증 모델

| 구분 | 조건 | 비고 |
|------|------|------|
| `requireAuthPre` | 세션 쿠키 유효 | 미인증 시 **401** `UNAUTHORIZED` |
| `adminPre` (`bootstrap` 인라인) | (A) `ADMIN_API_TOKEN` 설정 시 `Authorization: Bearer <동일 값>` **또는** (B) 세션 + 역할 `OWNER`/`ADMIN` | (A)만 만족하고 세션 없으면 일부 핸들러에서 테넌트 실패 가능 → PRD §7.4 |
| `GET /stocks` + `includeInactive=1` | 추가로 **OWNER/ADMIN** | 아니면 **403** |
| CSRF 출처 검사 | 비안전 메서드; Bearer 관리 토큰 일치 시 예외 | PRD §6·§7 |

## 엔드포인트 요약

### 종목 (`stocks.ts`)

| 메서드 | 경로 | Pre | 비고 |
|--------|------|-----|------|
| GET | `/stocks/search` | requireAuth | 쿼리 `q`, `size`(1~50 클램프); 상류 실패 **502** |
| GET | `/stocks` | requireAuth + includeInactive 검사 | `includeInactive=1` → `OWNER`/`ADMIN` 필요 |
| POST | `/stocks` | adminPre | **409** `DUPLICATE`, **409** `STOCK_LIMIT` |
| PATCH | `/stocks/:id` | adminPre | 재활성 시 **409** `STOCK_LIMIT`; **404** |
| DELETE | `/stocks/:id` | adminPre | 소프트 비활성 **204** |

### 테마 (`themes.ts`)

| 메서드 | 경로 | Pre | 비고 |
|--------|------|-----|------|
| GET | `/themes` | requireAuth | 응답은 **`isActive: true` 테마만**(비활성·삭제에 가까운 테마는 목록에 없음 — PRD §7.3) |
| POST | `/themes` | adminPre | **409** `DUPLICATE` |
| PATCH | `/themes/:id` | adminPre | **404** |
| DELETE | `/themes/:id` | adminPre | 소프트 비활성 **204** |
| PUT | `/themes/:id/stocks` | adminPre | 종목 ID 배열로 매핑 교체 |

### 뉴스 규칙 (`news-rules.ts`)

| 메서드 | 경로 | Pre | 비고 |
|--------|------|-----|------|
| GET | `/news-rules` | requireAuth | 테넌트 스코프 목록 |
| POST/PATCH/DELETE | `/news-rules` … | adminPre | GLOBAL/STOCK·`stockId` 검증 **400**; PATCH 후 캐시 무효화는 구현 일관성 점검(PRD §7.3) |

### 설정 (`settings.ts`)

| 메서드 | 경로 | Pre | 비고 |
|--------|------|-----|------|
| GET | `/settings`, `/settings/:key` | requireAuth | 없으면 **404** |
| PUT | `/settings/:key` | adminPre | **기존 키만** 수정 **404**; `market_data.provider` 등 시 **reloadMarket** |

## 오류 코드 (설정 UI 매핑용)

PRD §7.2 표와 동일 계열: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `DUPLICATE`, `STOCK_LIMIT`, `RATE_LIMIT`, `UPSTREAM_ERROR`, `CSRF_REJECTED`, `CSRF_CONFIG`.

서버 예외로 **HTTP 500** 및 비JSON 본문이 나올 수 있는 경로는 PRD §7.4·§7.5(테넌트 없는 Bearer 등) 참고.

## 전역 제한

- **쓰기 레이트 리밋:** 비GET 요청, IP당 윈도우 — 기본 `registerWriteRateLimit`(코드상 **120 / 60초**, 변경 시 문서 동기화).
- **CSRF:** 비안전 메서드 선행 검사 — 세부는 PRD §7.4.

## 계약 변경 시

1. 라우트 수정  
2. 본 문서 갱신  
3. [`docs/DECISION_LOG.md`](../../DECISION_LOG.md) 또는 합의 로그에 영향 기록  
4. PRD §8·§7 동기화
