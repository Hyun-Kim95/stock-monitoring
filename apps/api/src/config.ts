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
