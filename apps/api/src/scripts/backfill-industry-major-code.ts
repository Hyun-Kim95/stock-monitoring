import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@stock-monitoring/db";
import { fetchNaverStockIntegrationMeta } from "../lib/naver-stock-integration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

async function main() {
  const targets = await prisma.stock.findMany({
    where: {
      OR: [
        { industryMajorCode: null },
        { industryMajorCode: "" },
        { market: null },
        { market: "" },
      ],
    },
    select: { id: true, code: true, name: true, industryMajorCode: true, market: true },
    orderBy: { code: "asc" },
  });

  if (targets.length === 0) {
    console.log("[stock-meta-backfill] 산업·시장 채울 대상이 없습니다.");
    return;
  }

  console.log(`[stock-meta-backfill] 대상 ${targets.length}건 조회`);

  const concurrency = 5;
  let idx = 0;
  let updated = 0;
  let skipped = 0;

  async function worker() {
    while (idx < targets.length) {
      const current = targets[idx++];
      if (!current) return;

      const meta = await fetchNaverStockIntegrationMeta(current.code);
      const needIndustry = !(current.industryMajorCode?.trim() ?? "");
      const needMarket = !(current.market?.trim() ?? "");
      const nextIndustry = needIndustry ? meta.industryMajorCode : null;
      const nextMarket = needMarket ? meta.market : null;

      if (!nextIndustry && !nextMarket) {
        skipped += 1;
        console.log(`[stock-meta-backfill] skip ${current.code} ${current.name} (integration 없음)`);
        continue;
      }

      await prisma.stock.update({
        where: { id: current.id },
        data: {
          ...(nextIndustry ? { industryMajorCode: nextIndustry } : {}),
          ...(nextMarket ? { market: nextMarket } : {}),
        },
      });
      updated += 1;
      console.log(
        `[stock-meta-backfill] ok   ${current.code} ${current.name} industry=${nextIndustry ?? "(유지)"} market=${nextMarket ?? "(유지)"}`,
      );
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`[stock-meta-backfill] 완료: updated=${updated}, skipped=${skipped}, total=${targets.length}`);
}

main()
  .catch((e) => {
    console.error("[industry-backfill] 실패", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
