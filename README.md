# 국내 주식 모니터링 대시보드 (MVP)

Next.js + Fastify + PostgreSQL + Prisma 모노레포. 시세는 기본 **목(mock)** 이고, DB 설정 `market_data.provider=kis`와 `.env`의 KIS 키가 있으면 **한국투자증권 REST 현재가 폴링**으로 전환됩니다. 뉴스는 네이버 Client ID/Secret이 있으면 **실검색**, 없으면 목 피드입니다(자세한 변수명은 `.env.example`).

## 요구 사항

- Node.js 20+ (권장 22 — 루트 `.nvmrc`)
- npm 10+ (npm workspaces)
- Docker (로컬 PostgreSQL용, 선택)

## 빠른 시작

1. 환경 변수

   루트에 `.env`를 만들고 `.env.example`을 참고해 `DATABASE_URL` 등을 채웁니다.  
   API 프로세스는 루트 `.env`를 읽도록 실행할 수 있습니다(아래 스크립트).

   `apps/web/.env.local`:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000
   NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws/quotes
   ```

2. DB 기동 및 마이그레이션

   ```bash
   docker compose up -d
   npm install
   npm run db:generate
   npm exec --workspace=@stock-monitoring/db -- prisma migrate deploy
   npm run db:seed
   ```

   `DATABASE_URL`이 셸에 없으면 루트 `.env`에만 두고, 마이그레이션 전에 한 줄로:

   ```bash
   set DATABASE_URL=postgresql://stock:stock@localhost:5432/stock_monitoring
   npm exec --workspace=@stock-monitoring/db -- prisma migrate deploy
   ```

3. 개발 서버

   한 번에: `npm run dev` (api + web).  
   또는:

   ```bash
   npm run dev -w @stock-monitoring/api
   npm run dev -w @stock-monitoring/web
   ```

   - 대시보드: http://localhost:3000  
   - 관리자: http://localhost:3000/admin/stocks  

`ADMIN_API_TOKEN`을 설정한 경우, 관리자 화면에서 변경 요청을내려면 브라우저 `localStorage.setItem('adminToken','<토큰>')` 또는 `NEXT_PUBLIC_ADMIN_TOKEN`을 동일 값으로 맞춥니다. 비워 두면 로컬에서 관리자 API 인증이 생략됩니다.

## 스크립트 (루트)

| 명령 | 설명 |
|------|------|
| `npm run dev` | api + web 동시 실행 (`concurrently`) |
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:migrate` | 개발 마이그레이션 |
| `npm run db:seed` | 시드 데이터 |
| `npm run lint` | ESLint (`eslint.config.mjs`) |
| `npm run typecheck` | 전 패키지 `tsc --noEmit` (**선행:** `npm run db:generate`) |
| `npm run test` | Vitest (`api`, `shared`) |

## 문서

- `DEVELOPMENT_TODO.md` — 단계별 개발 체크리스트
- `DEPLOYMENT.md` — 배포·Docker·CI 메모
- `docs/PHASE0_OPERATIONS.md` — Phase 0 잠정 운영·API 메모
- `docs/DECISION_LOG.md` — 외부 API·인프라·운영 **합의안**(개정 시 여기만 갱신)
