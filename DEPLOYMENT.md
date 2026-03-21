# 배포 메모 (MVP)

운영·보안·배포 형태의 **합의안**은 `docs/DECISION_LOG.md` (D-003, D-004)를 따릅니다.

## 환경 변수

루트 `.env.example` 참고. 프로덕션에서는 최소:

- `DATABASE_URL`
- `API_PORT`, `CORS_ORIGIN`
- `ADMIN_API_TOKEN` (비우지 말 것)
- 웹 빌드 시: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`

## DB

```bash
npm run db:generate
npm exec --workspace=@stock-monitoring/db -- prisma migrate deploy
npm run db:seed   # 최초만
```

## API Docker (선택)

저장소 루트에서:

```bash
docker build -f Dockerfile.api -t stock-monitoring-api .
docker run --env-file .env -p 4000:4000 stock-monitoring-api
```

이미지는 `npm ci` 후 `prisma generate`, API는 `tsx`로 기동합니다(`@stock-monitoring/db`가 TS 소스를 export하므로).

## 리버스 프록시 (권장)

- `https://example.com/` → Next (`next start`)
- 동일 호스트에서 API를 붙일 경우: 경로 분리 또는 서브도메인 `api.example.com` → Fastify, WebSocket 업그레이드 허용.

## CI

GitHub Actions `.github/workflows/ci.yml`: `npm ci` → `db:generate` → `lint` / `typecheck` / `test`.

**참고:** 로컬·CI에서 `npm run typecheck` 전에 한 번 `npm run db:generate`가 필요합니다(Prisma Client 타입).
