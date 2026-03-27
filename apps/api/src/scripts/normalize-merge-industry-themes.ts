import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@stock-monitoring/db";
import { normalizeIndustryMajorLabel } from "../lib/naver-industry-major-name.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

async function main() {
  const themes = await prisma.theme.findMany({
    select: { id: true, name: true, isActive: true, createdAt: true, description: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof themes>();
  for (const t of themes) {
    const normalized = normalizeIndustryMajorLabel(t.name);
    const key = normalized || t.name.trim();
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  let renamed = 0;
  let mergedThemes = 0;
  let remappedLinks = 0;

  for (const [canonical, items] of groups) {
    if (items.length === 0) continue;

    let keep = items.find((x) => x.name === canonical) ?? items[0]!;
    if (keep.name !== canonical && canonical) {
      keep = await prisma.theme.update({
        where: { id: keep.id },
        data: { name: canonical },
      });
      renamed += 1;
      console.log(`[theme-normalize] rename ${items[0]!.name} -> ${canonical}`);
    }

    const losers = items.filter((x) => x.id !== keep.id);
    if (losers.length === 0) continue;

    for (const lose of losers) {
      const links = await prisma.stockThemeMap.findMany({
        where: { themeId: lose.id },
        select: { stockId: true },
      });
      if (links.length > 0) {
        await prisma.stockThemeMap.createMany({
          data: links.map((l) => ({ stockId: l.stockId, themeId: keep.id })),
          skipDuplicates: true,
        });
        remappedLinks += links.length;
      }
      await prisma.stockThemeMap.deleteMany({ where: { themeId: lose.id } });
      await prisma.theme.delete({ where: { id: lose.id } });
      mergedThemes += 1;
      console.log(`[theme-normalize] merge ${lose.name} -> ${keep.name}`);
    }
  }

  console.log(
    `[theme-normalize] 완료: renamed=${renamed}, mergedThemes=${mergedThemes}, remappedLinks=${remappedLinks}, themes=${themes.length}`,
  );
}

main()
  .catch((e) => {
    console.error("[theme-normalize] 실패", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
