---
type: doc
project: stockMonitoring
doc_lane: requirements
updated_at: 2026-05-12
tags: [platform-operator, api, contract]
related_prd: ../platform-operator-site-prd.md
status: active
---

# 플랫폼 운영자 API 계약

**SSOT:** `apps/api/src/routes/platform.ts`, `apps/api/src/lib/auth-session.ts` (`createRequirePlatformOperatorPreHandler`, `AuthContext`). PRD [`../platform-operator-site-prd.md`](../platform-operator-site-prd.md) §9는 **추천안 확정**으로 반영되었다. 계약과 코드가 어긋나면 **코드 수정 후 본 문서를 갱신**한다.

## 인증·권한

| 구분 | 조건 | HTTP 실패 |
|------|------|-----------|
| **`createRequirePlatformOperatorPreHandler`** | 유효 **세션 쿠키** + `User.isPlatformAdmin` → 세션 객체 `isPlatformOperator` | 미로그인 **401** `UNAUTHORIZED`; 로그인만 됨·플래그 없음 **403** `FORBIDDEN` |
| **`adminPre` / `ADMIN_API_TOKEN`** | 플랫폼 라우트에 **연결하지 않음** | PRD §0·§6 |
| **`PLATFORM_API_TOKEN`** (선택) | 도입 시에만 별도 프리핸들러; 세션과 **OR 하지 않거나** 계약으로 제한된 용도만 | 불일치·만료 **401** |

**테넌트 스코프:** `Tenant` 소유 데이터는 **경로 변수 `:tenantId`** 로 식별하는 것을 권장한다(예: `/platform/tenants/:tenantId/...`). PRD §6은 쿼리·헤더 명시도 허용하나, **1차 구현에서는 경로만 써도 됨** — 쿼리/헤더로 바꿀 경우 본 표와 PRD를 동시에 갱신한다. **세션의 `membership.tenantId`만으로 스코프를 추론하지 않는다**(PRD §0·§6).

**429 `error.code`:** 기존 제품 API와 동일하게 **`RATE_LIMIT`** 권장(`apps/api/src/lib/write-rate-limit.ts` 등과 혼선 방지). PRD §7.2와 본 문서는 이 명칭을 SSOT로 둔다.

## 공통 규약

### 베이스 경로

- 권장 접두사: **`/platform`** (구현 시 `apps/api` 라우트 prefix와 일치시킨다). 아래 표는 `/platform` 생략 없이 기술한다.

### 에러 봉투

기존 공개 API와 동일하게 다음 형태를 따른다.

```json
{ "error": { "code": "STRING", "message": "사람이 읽을 수 있는 메시지" } }
```

- **500/503** 응답 본문에 스택·내부 DB 에러 원문을 넣지 않는다.
- **권장:** 응답 헤더 `X-Request-Id`(또는 합의한 이름)로 로그 상관관계(PRD §7.2).

### 페이지네이션·목록 (테이블형)

| 쿼리 | 규칙 |
|------|------|
| `page` | 1 기반; 음수·0·비숫자는 **1로 클램프**. 총 페이지를 넘으면 **effectivePage = totalPages**로 클램프 후 해당 페이지 데이터(빈 배열 가능) **200**. |
| `pageSize` | 기본 **15**; **1~50**으로 클램프 — `.cursor/rules/30-table-pagination.mdc` 정합. |

### PRD §9 확정값 (구현 일치)

| 항목 | 확정 동작 |
|------|-----------|
| 사용자/문의 단건 없음 | **UUID 단건은 404** `NOT_FOUND`; 검색·목록은 **200** 빈 배열. |
| `PUT /platform/tenants/:tenantId/settings/:key` | Body JSON **`{ "value": string, "expectedUpdatedAt": ISO8601 }`**. DB `updatedAt`와 불일치 시 **409** `CONFLICT`. 감사 로그는 **설정 update와 동일 Prisma 트랜잭션** 내 INSERT. |
| 답변 `POST` | Body `{ "body": string }` (1~8000자). **60초 이내** 동일 본문·동일 작성자 중복 시 **409** `CONFLICT` (UI 연타 방지 1차). `Idempotency-Key` 헤더는 **미구현** — 도입 시 본 표에 추가. |
| `GET /platform/users/search` | DB 후보 **최대 100건**까지 읽은 뒤 클라이언트 측 페이지 슬라이스; 초과 시 **`truncated: true`**. 빈 `q`는 **400** `VALIDATION_ERROR`. |
| 페이지 범위 밖 | **200** + `page`를 유효 범위로 클램프(위 `page` 규칙). |
| 세션 운영자 플래그 | **`GET /auth/me`** 응답 `user` 객체에 **`isPlatformOperator: boolean`** (`User.isPlatformAdmin`). |
| 민감 조회 감사 | 사용자 단건·문의 단건 **조회 직후** `PlatformAuditLog` INSERT(트랜잭션과 분리). 쓰기(답변·설정)는 **감사를 비즈니스 쓰기와 동일 트랜잭션**. |
| `GET .../quote-health` | 테넌트 **활성 종목 최대 200** 코드에 대해 `StockQuoteHistory` 그룹 최대 시각; 종목 없음 **200** 빈 배열. |

---

## 엔드포인트 (MVP)

### 세션·운영자 확인

| 상태 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| 구현됨 | GET | **`/auth/me`** | 응답 `user`에 **`isPlatformOperator`** 포함(`User.isPlatformAdmin`). |
| 생략 | — | `GET /platform/me` | **구현 없음** — `/auth/me`와 중복. |

### 테넌트 D-01

| 메서드 | 경로 | 쿼리 | 성공 | 오류 |
|--------|------|------|------|------|
| GET | `/platform/tenants` | `q`, `page`, `pageSize` | 테넌트 목록 + 페이지 메타 | 401, 403, 429 |

| 메서드 | 경로 | 성공 | 오류 |
|--------|------|------|------|
| GET | `/platform/tenants/:tenantId` | 단건 | 401, 403, **404** |

### 사용자 지원 S-01 ~ S-03

| 메서드 | 경로 | 쿼리 | 성공 | 오류 |
|--------|------|------|------|------|
| GET | `/platform/users/search` | `q`, `page`, `pageSize` — 이메일·표시명 **contains**(대소문자 무시); `q`가 UUID 형식이면 **id 일치** OR에 추가 | `{ users, page, pageSize, total, totalPages, truncated }` | 401, 403, **400**(빈 `q`), 429 |

| 메서드 | 경로 | 성공 | 오류 |
|--------|------|------|------|
| GET | `/platform/users/:userId` | 프로필 + **멤버십 전체**(테넌트명·역할) | 401, 403, **404** |

### 문의 S-04 ~ S-05

| 메서드 | 경로 | 쿼리 | 성공 | 오류 |
|--------|------|------|------|------|
| GET | `/platform/tenants/:tenantId/inquiries` | `from`, `to`, `q`, `page`, `pageSize` | 문의 목록; `from`>`to` **400** | 401, 403, **404**(tenant), 429 |

| 메서드 | 경로 | 성공 | 오류 |
|--------|------|------|------|
| GET | `/platform/inquiries/:inquiryId` | 단건(본문·작성자·테넌트); 작성자 삭제 시 플레이스홀더 정책 PRD §8.3 | 401, 403, **404** |

| 메서드 | 경로 | Body | 성공 | 오류 |
|--------|------|------|------|------|
| POST | `/platform/inquiries/:inquiryId/replies` | `{ "body": "…" }` | **201** 생성된 답변 | 401, 403, **404**, **400**(길이), **409**(60초 내 중복), 429 |

### 시스템 설정 D-02

| 메서드 | 경로 | 성공 | 오류 |
|--------|------|------|------|
| GET | `/platform/tenants/:tenantId/settings` | 키·값 목록(민감 키 마스킹 정책은 PRD §5·운영 합의) | 401, 403, **404** |

| 메서드 | 경로 | Body | 성공 | 오류 |
|--------|------|------|------|------|
| PUT | `/platform/tenants/:tenantId/settings/:key` | `{ "value": "…", "expectedUpdatedAt": "…" }` (필수) | `{ setting: { key, value, updatedAt } }` | 401, 403, **404**, **400**, **409**(동시성), 429 |

### 수집 건강도 D-04 (1차 선택)

| 메서드 | 경로 | 성공 | 오류 |
|--------|------|------|------|
| GET | `/platform/tenants/:tenantId/quote-health` | 테넌트 종목 코드 기준 요약; 데이터 없음은 빈 배열/빈 객체 **200**(PRD §8.8) | 401, 403, 404, **503**(상류) |

### 종목·테마·뉴스 요약 D-03 (1차 선택·읽기 전용)

| 메서드 | 경로 | 성공 | 비고 |
|--------|------|------|------|
| GET | `/platform/tenants/:tenantId/catalog-summary` | 종목 수·테마 수·규칙 수 등 집계만 | 전량 CRUD는 `/settings` 유지 PRD §4.3 D-03 |

---

## 오류 코드 (초기 권장 집합)

| `code` | HTTP | 용도 |
|--------|------|------|
| `UNAUTHORIZED` | 401 | 세션 없음·만료·무효 플랫폼 토큰 |
| `FORBIDDEN` | 403 | 일반 사용자·전역 플래그 없음 |
| `VALIDATION_ERROR` | 400 | 파라미터·본문 검증 |
| `NOT_FOUND` | 404 | tenant / user / inquiry / setting key |
| `CONFLICT` | 409 | 설정 동시 수정 등 |
| `RATE_LIMIT` | 429 | 검색·목록·쓰기 레이트(제품 공통 명칭과 통일) |
| `UPSTREAM_ERROR` | 502 | 외부 HTTP 상류 실패(설정 UI 계약과 맞출 것) |
| `UPSTREAM_TIMEOUT` 등 | 503 | 시세·외부 타임아웃(명칭·코드는 구현과 맞출 것) |
| `CSRF_REJECTED` | 403 | 비안전 메서드 CSRF 출처 검사 실패(플랫폼 웹이 **동일 Fastify 앱·동일 CSRF 정책**을 쓰는 경우) |
| `CSRF_CONFIG` | 503 | CSRF 허용 출처 미설정 등(설정 UI [`../settings-ui/operations.md`](../settings-ui/operations.md) 참고) |
| (구현 관례) 내부 예외 | 500 | 본문에 스택·DB 원문 금지(PRD §7.2) |

## 전역 경로 vs 테넌트 경로 (혼선 방지)

| 구분 | 예시 경로 | `tenantId` |
|------|-----------|------------|
| **전역** | `GET /platform/tenants`, `GET /platform/users/search`, `GET /platform/users/:userId`, `GET /platform/inquiries/:inquiryId` | 경로에 없음(문의 단건은 **플랫폼 권한으로 크로스 테넌트** 조회). |
| **테넌트 스코프** | `GET /platform/tenants/:tenantId/inquiries`, `.../settings`, `.../quote-health` | **경로에 필수**. |

## 응답 필드 메모 (초안)

- **`GET /platform/inquiries/:inquiryId`**: 문의 본문·`tenantId`·작성자 요약 외에 **`SupportInquiryReply` 목록(시간순)** 을 포함하는 것을 권장(S-04 상세·S-05 맥락).

## 로드맵·비MVP (PRD §4.2 S-06, §4.3 D-05, §4.1 감사 UI)

| API (가칭) | PRD ID | 비고 |
|-------------|---------|------|
| `POST /platform/users/:userId/sessions/revoke` 등 | S-06 | 세션 무효화 — 보안 검토 후 별도 계약. |
| `POST /platform/tenants/:tenantId/jobs/quote-backfill` 등 | D-05 | 수동 백필 — 감사·확인 모달 필수. |
| 감사 로그 검색 API | §4.1 (선택) | UI “감사·로그” 구역이 생기면 본 절에 엔드포인트 추가. |

## 계약 변경 절차

1. PRD §9 항목 확정 또는 PRD 본문 수정  
2. 본 문서 표·오류 코드 갱신  
3. `operations.md` / `qa-checklist.md` 동기화  
4. 필요 시 [`docs/DECISION_LOG.md`](../../DECISION_LOG.md) 기록  

## 변경 이력 (본 문서)

| 일자 | 내용 |
|------|------|
| 2026-05-11 | 초안. |
| 2026-05-11 | `RATE_LIMIT` 통일, CSRF·500 행, 전역/테넌트 경로 표, replies 메모, 로드맵 API, 미확정 행(페이지 범위), UPSTREAM 행 분리, 테넌트 식별 권장(경로 우선). |
| 2026-05-11 | 미확정 표에 **추천안** 열 추가(PRD §9와 동기). |
| 2026-05-12 | PRD §9 **확정** 반영, 구현 SSOT로 전환, `page`/`pageSize` 클램프·`truncated`·설정 PUT 본문·답변 409·quote-health 상한·감사 정책 명시. |
