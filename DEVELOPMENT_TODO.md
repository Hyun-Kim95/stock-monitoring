# 국내 주식 모니터링 대시보드 — 개발 TODO 리스트

PRD 기준 MVP 완료를 위한 작업 분해 목록입니다. 순서는 **의존 관계(데이터 소스 확정 → 백엔드/DB → 실시간 → 뉴스 → 사용자 UI → 관리자 UI → 배포)**를 따릅니다.

---

## 진행 상태 요약 (레포 반영)

| Phase | 상태 |
|-------|------|
| 0 | **부분** — `docs/DECISION_LOG.md`에 1순위·운영안 **합의안**; 키 발급·약관·실측은 **진행 중** |
| 1 | **완료** (npm workspaces; 문서의 pnpm·`pnpm-workspace.yaml`은 **npm으로 대체**) |
| 2~3, 6~7 | **완료** (MVP) |
| 4 | 목 시세·WS·캐시·스냅샷 **완료**; 외부 어댑터 **미완**; 재연결 지연 유틸(`reconnect.ts`) 추가 |
| 5 | 규칙 필터·URL 중복 제거·TTL 캐시·목 뉴스 **완료**; 실제 포털 API **미완** |
| 8 | Zod·뉴스 처리·재연결 **단위 테스트**; E2E **미완** |
| 9 | `Dockerfile.api`, `DEPLOYMENT.md`, GitHub Actions CI **추가**; 전 항목 완료는 아님 |
| 10 | 프로덕 E2E 동시 확인 **미완** |

---

## Phase 0 — 선행 의사결정·준비 (블로커 해소)

### 0.1 실시간 시세 API
- [x] 후보 API 목록화 (증권사 Open API, 기타 공식 API) — `docs/PHASE0_OPERATIONS.md` 초안
- [x] 각 후보별 비교표 작성 — `docs/DECISION_LOG.md` **D-001** 표(한도·WS 열은 키 발급 후 채움)  
  - 실시간 체결/호가 지원 여부, WebSocket 여부  
  - 구독/동시 연결 제한, 호출 제한  
  - 인증 방식, 키 발급 절차  
  - 상업 이용·약관, 장애 시 대안
- [x] **1차 채택 API 확정** — **KIS Developers 1순위** (D-001, provisional)  
- [ ] 샌드박스/테스트 키 확보 및 표의 TBD 셀 기입
- [x] 장중·비장중 응답 필드 샘플 수집 → **내부 표준 스냅샷 스키마** 초안 정의  
  (예: `symbol`, `name`, `price`, `change`, `changeRate`, `volume`, `timestamp`, `marketSession`) — `packages/shared` Zod

### 0.2 뉴스 수집
- [x] 포털/뉴스 검색 API 후보 확정 (약관·한도·인증) — **D-002:** 네이버 뉴스 검색 1순위(provisional); 약관·한도는 발급 후 검증
- [x] 종목명·별칭으로 검색했을 때 **노이즈/누락** 샘플 테스트 — **계획:** `docs/NEWS_NOISE_TEST_PLAN.md` (실측은 API 연동 후)
- [x] 중복 제거 기준 결정 (URL 우선 vs 제목+시간 등) — 구현: **URL 우선** (`dedupeNewsByUrl`)

### 0.3 운영·보안 (로그인 없는 MVP)
- [x] 관리자 경로 보호 방식 결정 (예: 환경변수 시크릿 토큰, Basic Auth, IP 제한, 리버스 프록시 규칙) — MVP: `ADMIN_API_TOKEN` Bearer; 운영은 `DEPLOYMENT.md` 참고
- [x] API 키 저장 방침 (서버 전용, 암호화 여부, 관리자 UI 마스킹 규칙) — 설정 API 마스킹·서버 전용 env

### 0.4 규모·SLA
- [x] 관심종목 상한 운영 값 확정 (PRD 권장: 보장 50, 설계 100) — **D-005:** 하드 상한 100 = `stocks.max_active` + POST/PATCH 검증
- [x] “초단위” 해석 합의 (소스 틱 주기 vs 서버→클라이언트 브로드캐스트 주기) — 목 1s 틱 + `realtime.broadcast_throttle_ms`

---

## Phase 1 — 레포·인프라·공통 규약

> **본 문서에서 고정한 스택 (Phase 1~2 상세 기준)**  
> | 구분 | 선택 | 비고 |
> |------|------|------|
> | 런타임 | **Node.js 22 LTS** (또는 20 LTS) | `.nvmrc` / `engines`로 고정 |
> | 패키지 매니저 | **pnpm** (대안: npm workspaces 동일 구조) | 루트 `pnpm-workspace.yaml` |
> | 레포 형태 | **모노레포** `apps/` + `packages/` | API와 WS를 Next와 분리 |
> | 프론트 | **Next.js 15** App Router + **TypeScript** | PC 대시보드 + 어드민 라우트 그룹 |
> | API·실시간 | **Fastify** + **@fastify/websocket** + TypeScript | REST + 브라우저용 WS 한 프로세스 |
> | DB | **PostgreSQL 16+** | 로컬 Docker 또는 호스팅 |
> | ORM·마이그레이션 | **Prisma 6** | 스키마는 `packages/db`에 단일 소스 |
> | 검증·공유 타입 | **Zod** + `packages/shared` | API 요청/응답·WS 페이로드 스키마 |
> | (후속) 캐시 | **Redis** | MVP는 메모리 캐시로 시작해도 됨; Phase 4에서 도입 검토 |

**왜 API를 Next와 분리하는가:** 서버리스/엣지에서 WebSocket·장시간 외부 시세 연결이 불리합니다. **단일 VM/컨테이너에 `api` + `web`을 같이 올리는** 배포가 MVP에 잘 맞습니다.

### 1.0 목표 폴더 구조 (패키지 이름 포함)

루트 프로젝트명 예: `stock-monitoring` (디렉터리명 `stockMonitoring`과 병행 가능).

```text
stockMonitoring/
├── package.json                 # private: true, workspaces, 공통 스크립트
├── pnpm-workspace.yaml          # packages: apps/*, packages/*
├── .nvmrc                       # 22
├── .env.example                 # 루트 또는 각 앱에서 include (아래 1.4)
├── README.md
├── docker-compose.yml           # (선택) postgres만 로컬용
├── apps/
│   ├── web/                     # @stock-monitoring/web
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx                    # 메인 대시보드
│   │   │   │   └── (admin)/
│   │   │   │       ├── layout.tsx              # 어드민 공통 레이아웃
│   │   │   │       ├── admin/stocks/page.tsx
│   │   │   │       ├── admin/themes/page.tsx
│   │   │   │       └── admin/settings/page.tsx
│   │   │   ├── components/                     # dashboard/, admin/, ui/
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts             # fetch 래퍼, base URL
│   │   │   │   └── ws-client.ts              # 재연결·스냅샷 병합
│   │   │   └── hooks/
│   │   └── public/
│   └── api/                     # @stock-monitoring/api
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                      # Fastify listen
│           ├── config.ts                     # env 검증 (Zod)
│           ├── plugins/
│           │   ├── prisma.ts                 # PrismaClient 싱글톤
│           │   └── admin-auth.ts             # 헤더 토큰 등
│           ├── routes/
│           │   ├── health.ts
│           │   ├── stocks.ts
│           │   ├── themes.ts
│           │   ├── news-rules.ts
│           │   ├── settings.ts
│           │   └── news.ts                     # 종목별 뉴스 (Phase 5)
│           ├── modules/
│           │   ├── market-data/               # 어댑터 인터페이스 + 구현체 (Phase 4)
│           │   ├── news/                      # 수집·캐시 (Phase 5)
│           │   └── realtime/
│           │       ├── quote-cache.ts
│           │       ├── broadcaster.ts
│           │       └── ws-handler.ts
│           └── lib/
│               ├── errors.ts                  # 공통 에러 포맷
│               └── logger.ts
└── packages/
    ├── db/                      # @stock-monitoring/db
    │   ├── package.json
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   ├── migrations/
    │   │   └── seed.ts
    │   └── src/
    │       └── index.ts                       # export prisma client
    └── shared/                  # @stock-monitoring/shared
        ├── package.json
        └── src/
            ├── index.ts
            ├── quote-snapshot.ts              # 시세 스냅샷 Zod + 타입
            └── api/                           # REST DTO 스키마 (선택적 분리)
```

### 1.1 루트 `package.json` 스크립트·워크스페이스 TODO

- [x] `private: true`, `packageManager` 필드(pnpm 버전) 명시 — **npm workspaces 사용** (`packageManager` 생략)
- [x] `workspaces`: `apps/*`, `packages/*`
- [x] 스크립트 예시  
  - `dev`: `pnpm run -r --parallel dev` 또는 `turbo dev` (Turbo 도입 시)  
  - `db:generate`: `pnpm --filter @stock-monitoring/db exec prisma generate`  
  - `db:migrate`: `pnpm --filter @stock-monitoring/db exec prisma migrate dev`  
  - `db:seed`: `pnpm --filter @stock-monitoring/db exec prisma db seed`  
  - `lint` / `typecheck`: 전 패키지  
  → **실제:** 루트 `npm run dev` / `db:*` / `lint` / `typecheck` (npm `-w`·`npm exec --workspace=…` 패턴)
- [x] `@stock-monitoring/db`, `@stock-monitoring/shared`를 `api`·`web`의 `workspace:*` 의존성으로 연결

### 1.2 `apps/web` (@stock-monitoring/web) TODO

- [x] `create-next-app` 기반 또는 수동: App Router, TS, ESLint, **Tailwind 미사용 시** CSS Module/글로벌 CSS만으로도 가능 — Tailwind 사용
- [x] `next.config.ts`에서 `NEXT_PUBLIC_API_URL`로 API 베이스 설정
- [x] 절대 경로 별칭 `@/` → `src/`
- [x] 대시보드는 `src/app/page.tsx`, 어드민은 `src/app/(admin)/admin/...` 로 URL 네임스페이스 분리
- [x] 의존성: `zod`(클라이언트 검증이 필요할 때만), 공유 패키지 `@stock-monitoring/shared`

### 1.3 `apps/api` (@stock-monitoring/api) TODO

- [x] Fastify 앱 팩토리 + `index.ts`에서 `listen({ port: env.API_PORT, host: '0.0.0.0' })` — `bootstrap.ts` + `index.ts`
- [x] `@fastify/cors` — `web` 오리진만 허용 (환경변수 `CORS_ORIGIN`)
- [x] `@fastify/websocket` — 경로 예: `/ws/quotes`
- [x] `@stock-monitoring/db`의 `PrismaClient` 주입
- [x] 공통 응답 에러: `{ error: { code, message, details? } }` + HTTP 상태 매핑
- [x] 요청 로깅: `requestId` 헤더 또는 UUID
- [x] (선택) `@fastify/rate-limit` — 관리자 라우트에만 — **대체:** 비-GET 요청 IP당 분당 120회 `write-rate-limit.ts`

### 1.4 `packages/shared` (@stock-monitoring/shared) TODO

- [x] `QuoteSnapshotSchema` (Zod): PRD 내부 표준 스냅샷 필드와 1:1
- [x] REST용 `StockDto`, `ThemeDto`, `NewsRuleDto` 등 export (Prisma 결과와 매핑은 `api`에서)
- [x] WS 서버→클라이언트 메시지 유니온 타입: `snapshot` | `quote_update` | `status`

### 1.5 `packages/db` (@stock-monitoring/db) TODO

- [x] `prisma/schema.prisma`에 `generator client` + `datasource db` (PostgreSQL)
- [x] `package.json`에 `"prisma": { "seed": "tsx prisma/seed.ts" }"` 등 시드 진입점
- [x] 빌드 산출: `src/index.ts`에서 `export { prisma }` 또는 `PrismaClient` 재export 패턴 통일

### 1.6 환경변수·`.env.example` (이름만, 실값 없음)

| 변수 | 사용처 | 설명 |
|------|--------|------|
| `DATABASE_URL` | db, api | PostgreSQL 연결 문자열 |
| `API_PORT` | api | 기본 예: `4000` |
| `CORS_ORIGIN` | api | 예: `http://localhost:3000` |
| `ADMIN_API_TOKEN` | api, web | 관리자 REST용 `Authorization: Bearer` |
| `NEXT_PUBLIC_API_URL` | web | 브라우저에서 REST 호출 |
| `NEXT_PUBLIC_WS_URL` | web | 예: `ws://localhost:4000/ws/quotes` |
| `MARKET_DATA_API_KEY` 등 | api | Phase 0.1 확정 후 실제 키 이름 추가 |
| `NEWS_API_KEY` 등 | api | Phase 0.2 확정 후 |

- [x] 루트 또는 `apps/api`·`apps/web`별 `.env.example` 정리 + README에 로딩 순서 설명

### 1.7 배포·런타임 (기본)

- [x] 프로덕션: 동일 호스트에서 `api` 프로세스 + `web` `next start` (또는 `web`만 빌드 아티팩트 + 리버스 프록시로 `/api` 프록시는 **사용하지 않음** — REST가 전부 `api` 서버이므로 CORS/동일 도메인 프록시 전략 명시) — `DEPLOYMENT.md`
- [x] **권장 단순 배포:** Nginx/Caddy에서 `https://host/` → Next, `https://host/ws` 또는 별도 포트 → Fastify (또는 경로 프록시로 WS 업그레이드) — `DEPLOYMENT.md`
- [x] Docker: (선택) 멀티 스테이지 `Dockerfile.web`, `Dockerfile.api` + `compose`에 postgres — **`Dockerfile.api`만** (postgres는 기존 `docker-compose.yml`)
- [x] 수동 배포 체크리스트: DB 마이그레이션 → env 주입 → 프로세스 재시작 순서 — `DEPLOYMENT.md`

### 1.8 품질 도구

- [x] ESLint flat config 공유(루트) 또는 패키지별 — `eslint.config.mjs`
- [x] TypeScript `strict`, `api`/`web`/`shared` 참조 경로
- [ ] (선택) Husky + lint-staged

---

## Phase 2 — 데이터 저장소·스키마

### 2.1 DB·연결

- [x] PostgreSQL 로컬: Docker `postgres:16-alpine` 권장
- [x] `DATABASE_URL` 형식 문서화 (`postgresql://user:pass@localhost:5432/stock_monitoring`)
- [ ] Prisma `datasource`에 `directUrl` 필요 시(일부 호스팅) 주석으로 대비

### 2.2 Prisma 마이그레이션 워크플로

- [x] 초기: `pnpm --filter @stock-monitoring/db exec prisma migrate dev --name init` — **실제:** `npm run db:migrate` 등
- [x] CI/배포: `prisma migrate deploy`
- [x] 스키마 변경 시: 항상 마이그레이션 파일 커밋

### 2.3 `schema.prisma` 모델 상세 (필드·제약·인덱스)

아래는 **테이블/컬럼 네이밍을 Prisma 관례(camelCase)로 쓰고 `@@map`으로 DB는 snake**로 통일하는 패턴 예시입니다.

#### `Stock` → 테이블 `stocks`

| Prisma 필드 | DB 컬럼 | 제약 |
|-------------|---------|------|
| `id` | `id` | UUID, PK, `@default(uuid())` |
| `code` | `stock_code` | String, **unique** (6자리 등) |
| `name` | `stock_name` | String |
| `searchAlias` | `search_alias` | String? (또는 Text; 별칭 여러 개는 JSON 문자열·정규화는 후속) |
| `isActive` | `is_active` | Boolean `@default(true)` |
| `createdAt` | `created_at` | DateTime |
| `updatedAt` | `updated_at` | DateTime `@updatedAt` |

- [ ] 인덱스: `@@index([isActive])` — 대시보드 목록 조회

#### `Theme` → `themes`

| 필드 | 비고 |
|------|------|
| `id` | UUID PK |
| `name` | unique 권장 (`theme_name`) |
| `description` | String? |
| `isActive` | Boolean default true |
| `createdAt`, `updatedAt` | |

#### `StockThemeMap` → `stock_theme_maps`

| 필드 | 비고 |
|------|------|
| `id` | UUID PK (또는 복합 PK) |
| `stockId` | FK → Stock |
| `themeId` | FK → Theme |
| `createdAt` | |

- [x] **`@@unique([stockId, themeId])`**
- [x] `@@index([themeId])`, `@@index([stockId])`

#### `NewsSourceRule` → `news_source_rules`

공통/종목 규칙을 명시적으로 분리:

| 필드 | 타입 | 비고 |
|------|------|------|
| `id` | UUID | PK |
| `scope` | Enum `NewsRuleScope` | `GLOBAL` \| `STOCK` |
| `stockId` | UUID? | `scope === STOCK`일 때 필수 — **앱 레벨 검증** + DB는 `CHECK` 생략 가능 |
| `includeKeyword` | String? | |
| `excludeKeyword` | String? | |
| `priority` | Int | default 0, 클수록 우선 |
| `isActive` | Boolean | default true |
| `createdAt`, `updatedAt` | DateTime | |

- [x] `@@index([scope, isActive])`
- [x] `@@index([stockId])`

#### `SystemSetting` → `system_settings`

| 필드 | 비고 |
|------|------|
| `id` | UUID PK (또는 `settingKey`를 PK로 해도 됨) |
| `settingKey` | **unique** String |
| `settingValue` | String (Text) — 민감값은 암호화 앱 레벨 |
| `updatedAt` | `@updatedAt` |

**권장 `setting_key` 초기 목록 (시드에 넣기):**

- `market_data.provider` — 예: `mock` / `kis` 등
- `market_data.poll_interval_ms` — (폴링형 대비)
- `news.fetch_interval_ms`
- `news.max_items_per_stock`
- `realtime.broadcast_throttle_ms`

### 2.4 관계 다이어그램

```mermaid
erDiagram
  Stock ||--o{ StockThemeMap : has
  Theme ||--o{ StockThemeMap : has
  Stock ||--o{ NewsSourceRule : "optional when STOCK"
  SystemSetting }|..|{ Stock : "no FK"
```

### 2.5 시드 `packages/db/prisma/seed.ts` TODO

- [x] 활성 샘플 종목 3~5개 (실제 상장 코드)
- [x] 테마 2개, `StockThemeMap` 다대다 1건 이상
- [x] `NewsSourceRule`: `GLOBAL` 1건 + 특정 `STOCK` 1건
- [x] `SystemSetting`: 위 키 목록 기본값

### 2.6 Prisma Client 사용 규약 (`api`)

- [x] 조회 전용 대시보드용: `where: { isActive: true }` 헬퍼
- [x] 트랜잭션: 테마-매핑 일괄 수정 시 `prisma.$transaction`
- [x] (선택) 소프트 삭제 대신 `isActive`만 사용 — PRD와 일치

---

## Phase 3 — 백엔드 REST API (메타데이터)

### 3.1 종목 API (관리자·읽기)
- [x] 활성 종목 목록 조회 (대시보드용)
- [x] 종목 CRUD: 등록, 수정, 비활성화
- [x] 검색 별칭/키워드 필드 검증

### 3.2 테마 API
- [x] 테마 CRUD
- [x] 종목-테마 연결/해제 API
- [x] 테마별 종목 목록, 종목별 테마 목록 조회

### 3.3 뉴스 규칙 API
- [x] 규칙 CRUD (include/exclude/priority, 활성 여부)
- [x] 종목별·전역 규칙 조회 순서(우선순위) 정의

### 3.4 시스템 설정 API
- [x] 키-값 조회/갱신 (민감 필드 마스킹 응답)
- [x] 실시간 구독 대상/갱신 정책 등 설정 키 설계

### 3.5 공통
- [x] 입력 검증, 404/409 처리
- [x] 관리자 라우트에 Phase 0.3에서 정한 보호 적용

---

## Phase 4 — 시세 어댑터·실시간 중계

### 4.1 시세 어댑터 인터페이스
- [x] `connect` / `subscribe(symbols)` / `unsubscribe` / `onQuote` / `disconnect` 추상화 — `MarketDataProvider` (`start`/`stop`/`onTick`에 대응, 주석 참고)
- [ ] 외부 API 1종 구현체 (Phase 0.1 확정본)
- [x] 비장중·장중 세션 판별 로직 (API 필드 또는 서버 시계 기준) — 목: 서버 시계 기준 단순 장중

### 4.2 구독 집합 관리
- [x] DB 활성 종목 코드 집합 로드
- [x] 관리자가 종목 변경 시 **구독 목록 갱신** 경로 (재시작 없이 또는 재시작 허용 명시)

### 4.3 캐시·스냅샷
- [x] 종목별 최신 시세 메모리(또는 Redis) 캐시
- [x] 클라이언트 접속 시 **전체 스냅샷** 또는 **부분 스냅샷** 전송 전략

### 4.4 실시간 채널 (서버 → 브라우저)
- [x] WebSocket(또는 SSE) 엔드포인트
- [x] 연결 시 스냅샷 푸시
- [x] 캐시 갱신 시 구독 클라이언트에 브로드캐스트 (필요 시 배치/스로틀)
- [x] 연결 끊김 시 클라이언트 재연결 가이드에 맞는 서버 동작(동일 세션 재구독)

### 4.5 안정성
- [x] 외부 WS 끊김 → 지수 백오프 재연결 — **유틸만** `reconnect.ts` (외부 어댑터 연동 시 사용)
- [ ] 에러 상태 플래그 및 로그 (외부 장애 시 UI에 표시할 메시지 소스)

---

## Phase 5 — 뉴스 수집·제공

### 5.1 뉴스 프로바이더
- [ ] 검색 API 클라이언트 구현
- [ ] 종목별 검색어: `stock_name` + `search_alias` + `news_source_rules` 반영 — **목 데이터만** (실 API 시 반영)

### 5.2 후처리
- [x] 제외 키워드 필터
- [ ] 우선순위/소스 가중치 정렬
- [x] 중복 제거 (Phase 0.2 기준)
- [x] 최근 N건 메모리/DB 캐시 및 TTL

### 5.3 API
- [x] `GET /stocks/:id/news` 또는 `?code=` 형태의 종목별 뉴스 리스트
- [x] 시간순 정렬, 필드: 제목, 출처, 발행시각, 링크

### 5.4 트리거
- [x] 폴링 주기 설정 (`system_settings` 연동)
- [x] (선택) 사용자가 종목 선택 시 온디맨드 갱신 — 캐시 미스 시 재조회

---

## Phase 6 — 프론트: 메인 대시보드 (사용자)

### 6.1 레이아웃 (고정형 PC)
- [x] 그리드: 관심종목 리스트 | 선택 종목 상세 | 뉴스 리스트 | 테마 영역
- [x] 보조 모니터 가정: 폰트·행간·대비(장시간 피로) 기본 테마

### 6.2 데이터 연동
- [x] 초기 로드: 활성 종목 목록 + 테마 매핑
- [x] WebSocket 연결, 스냅샷 수신 후 상태 병합
- [x] 끊김 시 자동 재연결(백오프)

### 6.3 관심종목 리스트
- [x] 컬럼: 종목명, 코드, 현재가, 전일대비, 등락률, 거래량 등 (어댑터 스키마에 맞춤)
- [x] 등락 색상·갱신 시 시각적 피드백(깜빡임 등은 과하지 않게)

### 6.4 정렬·필터
- [x] 정렬: 현재가, 등락률, 거래량 등
- [x] 단순 필터: 텍스트 검색, 등락 구간 등 PRD 범위 내

### 6.5 종목 선택
- [x] 행 클릭 → 상세 영역 + 뉴스 API 호출
- [x] 테마 영역에 해당 종목의 테마 표시, 테마 클릭 시 같은 테마 종목 강조/필터

### 6.6 장중/비장중 UI
- [x] 세션에 따른 배지 또는 마지막가 표시 문구
- [ ] 외부 시세 장애 시 안내 배너

---

## Phase 7 — 프론트: 관리자 (미니 어드민)

### 7.1 종목 관리 화면
- [x] 목록, 등록/수정 폼, 비활성화
- [x] 검색 별칭 입력 UX (쉼표 구분 등)

### 7.2 테마 관리 화면
- [x] 테마 CRUD
- [x] 종목-테마 매핑 UI (멀티 셀렉트 또는 드래그 등 단순 방식)

### 7.3 뉴스/설정 화면
- [x] include/exclude/priority 규칙 편집
- [x] API 키·연동 설정 폼 (마스킹, 갱신만 가능하게)

### 7.4 공통
- [x] API 에러 토스트/인라인 메시지
- [x] Phase 0.3 보호와 연동 (토큰 헤더 등)

---

## Phase 8 — 테스트·품질

### 8.1 단위·통합
- [x] 시세 어댑터: 샘플 페이로드 → 내부 스냅샷 변환 테스트 — **부분:** `QuoteSnapshotSchema`·WS 메시지 Zod 테스트
- [x] 뉴스: 규칙 merge·필터·중복 제거 테스트 — `process.test.ts`
- [ ] REST: 종목/테마/규칙 CRUD 테스트

### 8.2 실시간
- [ ] 모의(mock) 시세 스트림으로 WS 클라이언트 부하 간단 검증
- [x] 재연결 시나리오 수동 시나리오 체크리스트 — **부분:** `reconnect.test.ts` (지연 계산)

### 8.3 E2E (선택, 시간 허용 시)
- [ ] Playwright/Cypress로 대시보드 로드·종목 클릭·뉴스 표시

---

## Phase 9 — 배포·운영 최소화

- [x] 프로덕션 환경변수 문서화 — `DEPLOYMENT.md`
- [x] DB 마이그레이션 배포 순서 — `DEPLOYMENT.md`
- [ ] 프로세스 관리 (systemd / pm2 / 컨테이너 재시작 정책)
- [ ] 로그 수집 위치·로테이션 최소 설정
- [ ] “외부 API 장애” 시 사용자 화면 문구·관리자 확인 방법 정리

---

## Phase 10 — MVP 완료 체크 (PRD §5.2)

- [x] 관심종목 등록/조회 동작 (관리자 등록 + 대시보드 조회)
- [x] 실시간 시세 수신 및 화면 반영 — **목** 프로바이더
- [x] 종목별 뉴스 리스트 조회 — **목** 뉴스
- [x] 관리자: 종목, 테마, 뉴스 소스, 시스템 설정 관리
- [ ] 기본 배포 환경에서 end-to-end 동작 확인

---

## 의존 관계 요약

```mermaid
flowchart LR
  P0[Phase 0 의사결정]
  P1[Phase 1 부트스트랩]
  P2[Phase 2 DB]
  P3[Phase 3 REST]
  P4[Phase 4 실시간]
  P5[Phase 5 뉴스]
  P6[Phase 6 대시보드]
  P7[Phase 7 관리자 UI]
  P8[Phase 8 테스트]
  P9[Phase 9 배포]
  P0 --> P1 --> P2 --> P3
  P3 --> P4
  P3 --> P5
  P4 --> P6
  P5 --> P6
  P3 --> P7
  P6 --> P8
  P7 --> P8
  P8 --> P9
```

---

## 병렬 가능 작업 (인력 나눌 때)

- **A트랙**: Phase 2~3 REST + Phase 7 관리자 UI
- **B트랙**: Phase 0.1 확정 후 Phase 4 시세 어댑터·WS
- **C트랙**: Phase 0.2 확정 후 Phase 5 뉴스
- **D트랙**: Phase 6 대시보드 레이아웃·목업 → 목 API로 병행

1인 개발 시 권장 순서: **0 → 1 → 2 → 3 → 4 → 6(목 데이터) → 5 → 6(연동 완성) → 7 → 8 → 9**.

---

*문서 버전: PRD MVP 기준. Phase 1~2는 **Next.js 15 + Fastify + PostgreSQL + Prisma + pnpm 모노레포** 기준으로 상세화함. 스택을 바꿀 경우 Phase 1 트리·패키지명·스크립트를 그에 맞게 치환하면 됨. 시세/뉴스 API 확정 후 Phase 4·5 세부 TODO를 해당 벤더 스펙에 맞게 조정하세요.*
