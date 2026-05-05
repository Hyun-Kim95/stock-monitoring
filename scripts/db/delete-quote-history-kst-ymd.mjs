/**
 * KST 달력 하루 구간의 stock_quote_history 행을 삭제한다(운영 일회·재실행용).
 *
 * 사용법(모노레포 루트에서):
 *   node scripts/db/delete-quote-history-kst-ymd.mjs 20260505 --dry-run
 *   node scripts/db/delete-quote-history-kst-ymd.mjs 2026-05-05 --execute
 *
 * --dry-run: 해당 구간 행 개수만 출력
 * --execute: 실제 DELETE (--dry-run 과 동시 지정 불가)
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

function normalizeYmd(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) return null;
  const start = new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const check = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  if (check.replace(/-/g, "") !== digits) return null;
  return digits;
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const execute = argv.includes("--execute");
  const pos = argv.filter((a) => !a.startsWith("--"));
  const ymd = normalizeYmd(pos[0] ?? "");
  return { ymd, dryRun, execute };
}

const argv = process.argv.slice(2);
const { ymd, dryRun, execute } = parseArgs(argv);

if (!ymd) {
  console.error(
    "Usage: node scripts/db/delete-quote-history-kst-ymd.mjs <YYYYMMDD|YYYY-MM-DD> (--dry-run | --execute)\n" +
      "  Example: node scripts/db/delete-quote-history-kst-ymd.mjs 20260505 --dry-run",
  );
  process.exit(1);
}

if (dryRun === execute) {
  console.error("정확히 하나만 지정하세요: --dry-run 또는 --execute");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL이 없습니다. 루트 .env 를 확인하세요.");
  process.exit(1);
}

const dayStart = new Date(
  `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+09:00`,
);
const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::bigint AS c
    FROM "stock_quote_history"
    WHERE "recorded_at" >= ${dayStart} AND "recorded_at" < ${dayEnd}
  `;
  const c = rows[0]?.c ?? 0n;
  const n = typeof c === "bigint" ? Number(c) : Number(c);
  console.info(`KST ${ymd} (${dayStart.toISOString()} ~ ${dayEnd.toISOString()}) 대상 행: ${n}건`);

  if (dryRun) {
    console.info("--dry-run: DELETE 는 수행하지 않았습니다.");
    process.exit(0);
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM "stock_quote_history"
    WHERE "recorded_at" >= ${dayStart} AND "recorded_at" < ${dayEnd}
  `;
  console.info(`DELETE 완료(삭제 시도 행 수 표시는 드라이버에 따라 다를 수 있음): ${String(deleted)}`);
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
