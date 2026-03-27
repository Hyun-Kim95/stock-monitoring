import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@stock-monitoring/db";
import { getNaverIndustryMajorName } from "../lib/naver-industry-major-name.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

function normalizeThemeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

async function main() {
  const stocks = await prisma.stock.findMany({
    where: { isActive: true, NOT: { industryMajorCode: null } },
    select: { id: true, code: true, name: true, industryMajorCode: true },
    orderBy: { code: "asc" },
  });

  if (stocks.length === 0) {
    console.log("[industry-theme-backfill] 대상 종목이 없습니다.");
    return;
  }

  let createdThemes = 0;
  let linkedPairs = 0;
  let skipped = 0;

  for (const s of stocks) {
    const code = s.industryMajorCode?.trim();
    if (!code) {
      skipped += 1;
      continue;
    }

    const industryNameRaw = await getNaverIndustryMajorName(code);
    const industryName = industryNameRaw ? normalizeThemeName(industryNameRaw) : "";
    if (!industryName) {
      skipped += 1;
      console.log(`[industry-theme-backfill] skip ${s.code} ${s.name} (산업명 조회 실패: ${code})`);
      continue;
    }

    const theme = await prisma.$transaction(async (tx) => {
      const found = await tx.theme.findFirst({
        where: { name: { equals: industryName, mode: "insensitive" } },
      });
      if (found) return { id: found.id, created: false };

      const created = await tx.theme.create({
        data: {
          name: industryName,
          isActive: true,
          description: `네이버 산업대분류(${code}) 자동 매핑`,
        },
      });
      return { id: created.id, created: true };
    });

    if (theme.created) {
      createdThemes += 1;
      console.log(`[industry-theme-backfill] theme+ ${industryName}`);
    }

    await prisma.stockThemeMap.upsert({
      where: { stockId_themeId: { stockId: s.id, themeId: theme.id } },
      create: { stockId: s.id, themeId: theme.id },
      update: {},
    });
    linkedPairs += 1;
    console.log(`[industry-theme-backfill] link  ${s.code} ${s.name} -> ${industryName}`);
  }

  console.log(
    `[industry-theme-backfill] 완료: themes_created=${createdThemes}, links=${linkedPairs}, skipped=${skipped}, stocks=${stocks.length}`,
  );
}

main()
  .catch((e) => {
    console.error("[industry-theme-backfill] 실패", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
