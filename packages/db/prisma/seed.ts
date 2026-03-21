import { PrismaClient, NewsRuleScope } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const s1 = await prisma.stock.upsert({
    where: { code: "005930" },
    update: {},
    create: {
      code: "005930",
      name: "삼성전자",
      searchAlias: "삼성,삼전",
      isActive: true,
    },
  });
  const s2 = await prisma.stock.upsert({
    where: { code: "000660" },
    update: {},
    create: {
      code: "000660",
      name: "SK하이닉스",
      searchAlias: "하이닉스,SK하닉",
      isActive: true,
    },
  });
  const s3 = await prisma.stock.upsert({
    where: { code: "035420" },
    update: {},
    create: {
      code: "035420",
      name: "NAVER",
      searchAlias: "네이버",
      isActive: true,
    },
  });

  const t1 = await prisma.theme.upsert({
    where: { name: "반도체" },
    update: {},
    create: { name: "반도체", description: "반도체 관련", isActive: true },
  });
  const t2 = await prisma.theme.upsert({
    where: { name: "플랫폼" },
    update: {},
    create: { name: "플랫폼", description: "인터넷 플랫폼", isActive: true },
  });

  await prisma.stockThemeMap.deleteMany({});
  await prisma.stockThemeMap.createMany({
    data: [
      { stockId: s1.id, themeId: t1.id },
      { stockId: s2.id, themeId: t1.id },
      { stockId: s3.id, themeId: t2.id },
    ],
  });

  await prisma.newsSourceRule.deleteMany({});
  await prisma.newsSourceRule.createMany({
    data: [
      {
        scope: NewsRuleScope.GLOBAL,
        stockId: null,
        includeKeyword: null,
        excludeKeyword: "광고",
        priority: 0,
        isActive: true,
      },
      {
        scope: NewsRuleScope.STOCK,
        stockId: s1.id,
        includeKeyword: "삼성전자",
        excludeKeyword: null,
        priority: 10,
        isActive: true,
      },
    ],
  });

  const settings = [
    { key: "market_data.provider", value: "mock" },
    { key: "market_data.poll_interval_ms", value: "1000" },
    { key: "news.fetch_interval_ms", value: "60000" },
    { key: "news.max_items_per_stock", value: "30" },
    { key: "realtime.broadcast_throttle_ms", value: "250" },
    { key: "stocks.max_active", value: "100" },
  ];
  for (const { key, value } of settings) {
    await prisma.systemSetting.upsert({
      where: { settingKey: key },
      update: { settingValue: value },
      create: { settingKey: key, settingValue: value },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
