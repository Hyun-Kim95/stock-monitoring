# 국내 주식 모니터링 대시보드 (MVP)

Next.js + Fastify + PostgreSQL + Prisma 모노레포. 시세는 기본 **목(mock)** 이고, DB 설정 `market_data.provider=kis`와 `.env`의 KIS 키가 있으면 **한국투자증권 REST 현재가 폴링**으로 전환됩니다. 뉴스는 네이버 Client ID/Secret이 있으면 **실검색**(0건이면 빈 목록, API 실패 시 오류 메시지 표시), 없으면 **목 피드**입니다(`.env.example`).

## 요구 사항

- Node.js 20+ (권장 22 — 루트 `.nvmrc`)
- npm 10+ (npm workspaces)
- PostgreSQL 16+ (로컬 설치 또는 원격 인스턴스)

## 빠른 시작

1. 환경 변수

   루트에 `.env`를 만들고 `.env.example`을 참고해 `DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` 등을 채웁니다.  
   API·Prisma·Next(웹) 모두 이 루트 `.env`(및 선택적 루트 `.env.local`)를 읽습니다.

2. PostgreSQL 준비 및 마이그레이션

   PC(또는 원격)에 PostgreSQL을 띄우고, DB·사용자·비밀번호를 만든 뒤 루트 `.env`의 `DATABASE_URL`을 그에 맞게 설정합니다.

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate:deploy
   npm run db:seed
   ```

   Prisma 스크립트는 **루트 `.env`를 먼저 로드**합니다. `DATABASE_URL`은 반드시 루트 `.env`에 두면 됩니다.

3. 개발 서버

   한 번에: `npm run dev` (api + web).  
   또는:

   ```bash
   npm run dev -w @stock-monitoring/api
   npm run dev -w @stock-monitoring/web
   ```

   - 대시보드: http://localhost:3000  
   - 관리자: http://localhost:3000/admin/stocks  

`ADMIN_API_TOKEN`을 설정한 경우, 루트 `.env`의 `NEXT_PUBLIC_ADMIN_TOKEN`을 같은 값으로 맞춘 뒤 웹을 다시 띄웁니다. 둘 다 비우면 로컬에서 관리자 API 인증이 생략됩니다.

## 스크립트 (루트)

| 명령 | 설명 |
|------|------|
| `npm run dev` | api + web 동시 실행 (`concurrently`) |
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:migrate` | 개발 마이그레이션 (`migrate dev`) |
| `npm run db:migrate:deploy` | 배포/CI용 `migrate deploy` (루트 `.env` 로드) |
| `npm run db:seed` | 시드 데이터 |
| `npm run lint` | ESLint (`eslint.config.mjs`) |
| `npm run typecheck` | 전 패키지 `tsc --noEmit` (**선행:** `npm run db:generate`) |
| `npm run test` | Vitest (`api`, `shared`) |

## 문서

- `DEVELOPMENT_TODO.md` — 단계별 개발 체크리스트
- `DEPLOYMENT.md` — 배포·CI 메모
- `docs/PHASE0_OPERATIONS.md` — Phase 0 잠정 운영·API 메모
- `docs/DECISION_LOG.md` — 외부 API·인프라·운영 **합의안**(개정 시 여기만 갱신)
