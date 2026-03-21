# 진행 현황 (TODO 대비)

최종 업데이트: 2026-03 — `DEVELOPMENT_TODO.md` 체크박스와 동기화.

---

## 이번에 구현·추가한 것 (완료로 볼 수 있는 항목)

### Phase 1 — 레포·인프라
- [x] npm **workspaces** 모노레포 (`apps/*`, `packages/*`)
- [x] `apps/web` — Next.js 15 App Router, 대시보드 + 관리자 라우트
- [x] `apps/api` — Fastify + CORS + `@fastify/websocket`, `bootstrap.ts` 분리, `dotenv`로 루트 `.env` 로드
- [x] `packages/shared` — Zod 시세 스냅샷·WS 메시지·API 입력 스키마
- [x] `packages/db` — Prisma 스키마( PRD 모델 ) + 시드 스크립트 + 초기 마이그레이션 SQL
- [x] 루트 스크립트: `dev`(concurrently), `db:generate`, `db:migrate`, `db:push`, `db:seed`, `lint`, `typecheck`, `test`
- [x] `.env.example`, `docker-compose.yml`(PostgreSQL 16), `.gitignore`, `README.md`, `.nvmrc`
- [x] ESLint flat `eslint.config.mjs`, Vitest 단위 테스트(api/shared)

### Phase 2 — DB
- [x] 테이블: `stocks`, `themes`, `stock_theme_maps`, `news_source_rules`(GLOBAL/STOCK), `system_settings`
- [x] 시드: 샘플 종목·테마·매핑·뉴스 규칙·시스템 설정 키

### Phase 3 — REST API
- [x] `GET /health`
- [x] 종목: `GET /stocks`, `GET /stocks/:id`, `POST/PATCH/DELETE /stocks` (관리자)
- [x] 테마: `GET /themes`, CRUD, `PUT /themes/:id/stocks` 매핑
- [x] 뉴스 규칙: `GET /news-rules`, CRUD
- [x] 설정: `GET /settings`, `GET /settings/:key`, `PUT /settings/:key` (값 마스킹)
- [x] `GET /stocks/:id/news` — 목 뉴스 + 규칙 필터 + URL 중복 제거 + TTL 캐시

### Phase 4 — 실시간 (MVP)
- [x] **목 시세 프로바이더** — 1초 틱, 장중/비장중 단순 판별
- [x] 메모리 `QuoteCache`, WS `/ws/quotes` — 접속 시 스냅샷 + 스로틀된 스냅샷 푸시
- [x] 종목 변경 시 DB에서 다시 로드해 목 프로바이더 재시작
- [x] 재연결 지연 유틸 `nextReconnectDelayMs` (외부 어댑터용)
- [x] 비-GET 요청 IP당 분당 120회 제한 (`write-rate-limit.ts`)
- [ ] 외부 증권 API WebSocket 어댑터, 외부 끊김 라이브 백오프 연동

### Phase 5 — 뉴스
- [x] API·UI 연동용 **목 뉴스** + 규칙 후처리 + 캐시
- [ ] 실제 포털/검색 API 연동, 소스 가중치 정렬

### Phase 6 — 사용자 대시보드
- [x] 고밀도 다크 UI, 관심종목 테이블, WS 시세 반영
- [x] 정렬(현재가·등락률·거래량·이름), 텍스트/테마 필터
- [x] 종목 선택 시 뉴스 목록, 테마 표시·테마 필터
- [x] WS 재연결(클라이언트 백오프)

### Phase 7 — 관리자 UI
- [x] `/admin/stocks`, `/admin/themes`, `/admin/news-rules`, `/admin/settings`
- [x] Bearer: `ADMIN_API_TOKEN` 설정 시 필요, 미설정 시 로컬에서 생략
- [x] 브라우저 `localStorage.adminToken` 또는 `NEXT_PUBLIC_ADMIN_TOKEN` 지원

### Phase 8~9
- [x] 단위 테스트: shared Zod, 뉴스 처리, 재연결 지연
- [x] `Dockerfile.api`, `DEPLOYMENT.md`, GitHub Actions `ci.yml`
- [ ] REST 통합/E2E, 프로덕션 프로세스·로그 운영 문서 전부

### Phase 0 (선행 의사결정)
- [x] 초안 문서 `docs/PHASE0_OPERATIONS.md`
- [ ] 실시간 시세 **공식 API 확정** 및 어댑터 구현
- [ ] 뉴스 **API 확정** 및 수집기 구현

---

## 바로 할 일 (로컬에서 한 번에 동작시키기)

1. PostgreSQL 기동: `docker compose up -d`
2. 루트에 `.env` 복사 (`.env.example` 참고), `DATABASE_URL` 확인
3. `npm install` → `npm run db:generate` → `npm exec --workspace=@stock-monitoring/db -- prisma migrate deploy` → `npm run db:seed`
4. `npm run dev` (또는 API/Web 각각 `-w`)
5. `apps/web/.env.local`에 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` 설정

품질: `npm run db:generate` 후 `npm run typecheck` / `npm run lint` / `npm run test`

---

## 요약

| 구분 | 상태 |
|------|------|
| 모노레포·스키마·REST·WS·대시보드·어드민 | 구현됨 (목 시세/목 뉴스) |
| 뉴스 규칙·TTL 캐시·쓰기 rate limit·bootstrap·테스트·CI | 추가됨 |
| 실제 시세·뉴스 API·REST 통합 테스트·E2E·운영 로그 | 미구현 |
