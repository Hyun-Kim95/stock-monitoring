/**
 * stock_quote_history 최근 행에 대해, 분봉 집계와 동일한 KST 분 버킷 시작(1분봉)을 계산해 출력한다.
 * (읽기 전용 — DELETE 없음)
 *
 * 사용: 모노레포 루트에서
 *   node scripts/db/inspect-minute-period-kst.mjs 005930
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

let code = (process.argv[2] ?? "").replace(/\D/g, "");
while (code.length > 0 && code.length < 6) code = `0${code}`;
if (code.length > 6) code = code.slice(-6);
if (!code) {
  console.error("Usage: node scripts/db/inspect-minute-period-kst.mjs <stockCode e.g. 005930>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const tzRows = await prisma.$queryRaw`SHOW TIME ZONE`;
  console.info("SHOW TIME ZONE:", tzRows);

  const rows = await prisma.$queryRaw`
    SELECT
      "recorded_at",
      "price",
      (date_trunc('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS period_kst
    FROM "stock_quote_history"
    WHERE "stock_code" = ${code}
    ORDER BY "recorded_at" DESC
    LIMIT 25
  `;
  console.info(`Last 25 ticks for ${code} (recorded_at, price, period_kst = KST minute bucket as timestamptz):\n`);
  for (const r of rows) {
    console.info(JSON.stringify({ recorded_at: r.recorded_at, price: r.price, period_kst: r.period_kst }));
  }
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
