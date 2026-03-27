import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@stock-monitoring/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

type NaverIntegration = { industryCode?: unknown };

async function fetchIndustryMajorCodeFromNaver(code: string): Promise<string | null> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`, {
      headers: { Accept: "application/json", "User-Agent": "stock-monitoring/1.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as NaverIntegration;
    const raw = String(json.industryCode ?? "").trim();
    return raw ? raw : null;
  } catch {
    return null;
  }
}

async function main() {
  const targets = await prisma.stock.findMany({
    where: {
      OR: [{ industryMajorCode: null }, { industryMajorCode: "" }],
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  if (targets.length === 0) {
    console.log("[industry-backfill] 채울 대상이 없습니다.");
    return;
  }

  console.log(`[industry-backfill] 대상 ${targets.length}건 조회`);

  const concurrency = 5;
  let idx = 0;
  let updated = 0;
  let skipped = 0;

  async function worker() {
    while (idx < targets.length) {
      const current = targets[idx++];
      if (!current) return;

      const code = await fetchIndustryMajorCodeFromNaver(current.code);
      if (!code) {
        skipped += 1;
        console.log(`[industry-backfill] skip ${current.code} ${current.name} (industryCode 없음)`);
        continue;
      }

      await prisma.stock.update({
        where: { id: current.id },
        data: { industryMajorCode: code },
      });
      updated += 1;
      console.log(`[industry-backfill] ok   ${current.code} ${current.name} -> ${code}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`[industry-backfill] 완료: updated=${updated}, skipped=${skipped}, total=${targets.length}`);
}

main()
  .catch((e) => {
    console.error("[industry-backfill] 실패", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
