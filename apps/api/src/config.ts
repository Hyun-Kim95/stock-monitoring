import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_API_TOKEN: z.string().optional(),
  /** KIS Open API — `market_data.provider=kis`일 때 사용. 없으면 mock으로 폴백 */
  KIS_APP_KEY: z.string().optional(),
  KIS_APP_SECRET: z.string().optional(),
  /** 비우면 모의투자: openapivts…29443 */
  KIS_REST_BASE_URL: z.string().optional(),
  KIS_TR_ID_PRICE: z.string().optional(),
  /** inquire-price 종목 간 최소 간격(ms). 비우면 400. KIS 초당 건수 제한(EGW00201) 완화 */
  KIS_QUOTE_REQUEST_GAP_MS: z.coerce.number().int().positive().max(10_000).optional(),
  /** 투자자 수급 전용 TR 재조회 주기(ms). 기본 10000 */
  KIS_INVESTOR_REFRESH_MS: z.coerce.number().int().min(0).max(600_000).optional(),
  /** Redis (선택): 분봉 캐시/락 공유. 미설정 시 인메모리 동작 */
  REDIS_URL: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().optional(),
  /**
   * 서버 기동 시 stock_quote_history 정리.
   * none=안 함, today=오늘 KST 0시(당일) 데이터만 삭제, today_8kst=오늘 KST 08:00 미만 전부 삭제(전일·당일 새벽 제거), all=전체 TRUNCATE
   */
  QUOTE_HISTORY_RESET_ON_START: z.enum(["none", "today", "today_8kst", "all"]).default("none"),
  /** KIS 사용 시 기동 직후 오늘 분봉을 종목별로 먼저 백필한 뒤 폴링 시작 */
  KIS_STARTUP_MINUTE_BACKFILL: z.coerce.boolean().default(true),
  /** 네이버 검색(뉴스) — 없으면 목 뉴스 */
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
