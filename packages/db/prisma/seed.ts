import { PrismaClient, NewsRuleScope } from "@prisma/client";

const prisma = new PrismaClient();

/** 기본 관심종목 (코드 오름차순). searchAlias는 뉴스 검색용 쉼표 구분. */
const STOCK_SEED: {
  code: string;
  name: string;
  searchAlias: string | null;
  /** `THEME_NAMES`에 정의된 테마명 */
  themes: string[];
}[] = [
  { code: "000500", name: "가온전선", searchAlias: "Gaon cable", themes: ["산업"] },
  { code: "000660", name: "SK하이닉스", searchAlias: "하이닉스,SK하닉", themes: ["반도체"] },
  { code: "000720", name: "현대건설", searchAlias: "현건", themes: ["산업"] },
  { code: "000910", name: "유니온", searchAlias: null, themes: ["산업"] },
  { code: "001820", name: "삼화콘덴서", searchAlias: "삼화", themes: ["산업"] },
  { code: "003530", name: "한화투자증권", searchAlias: "한투", themes: ["금융"] },
  { code: "005380", name: "현대차", searchAlias: "현대 자동차", themes: ["산업"] },
  { code: "005930", name: "삼성전자", searchAlias: "삼성,삼전", themes: ["반도체"] },
  { code: "006730", name: "서부T&D", searchAlias: "서부티앤디", themes: ["산업"] },
  { code: "009150", name: "삼성전기", searchAlias: "삼전", themes: ["반도체"] },
  { code: "010060", name: "OCI홀딩스", searchAlias: "OCI", themes: ["산업"] },
  { code: "035420", name: "NAVER", searchAlias: "네이버", themes: ["플랫폼"] },
  { code: "042000", name: "카페24", searchAlias: "cafe24", themes: ["플랫폼"] },
  { code: "059270", name: "해성에어로보틱스", searchAlias: "해성에어로", themes: ["산업"] },
  { code: "064260", name: "다날", searchAlias: "Danal", themes: ["플랫폼"] },
  { code: "066570", name: "LG전자", searchAlias: "엘지전자", themes: ["산업"] },
  { code: "066620", name: "국보디자인", searchAlias: "국보", themes: ["산업"] },
  { code: "078160", name: "메디포스트", searchAlias: null, themes: ["바이오"] },
  { code: "079370", name: "제우스", searchAlias: "Zeus", themes: ["반도체"] },
  { code: "079550", name: "LIG넥스원", searchAlias: "넥스원,LIG", themes: ["산업"] },
  { code: "080220", name: "제주반도체", searchAlias: null, themes: ["반도체"] },
  { code: "131970", name: "두산테스나", searchAlias: "테스나", themes: ["반도체"] },
  { code: "141080", name: "리가켐바이오", searchAlias: "리가켐", themes: ["바이오"] },
  { code: "160190", name: "하이젠알앤엠", searchAlias: "하이젠", themes: ["산업"] },
  { code: "281740", name: "레이크머티리얼즈", searchAlias: "레이크머티리얼", themes: ["반도체"] },
  { code: "352820", name: "하이브", searchAlias: "HYBE,빅히트", themes: ["플랫폼"] },
  { code: "373220", name: "LG에너지솔루션", searchAlias: "엘지에솔,LGES", themes: ["산업"] },
  { code: "389500", name: "에스비비테크", searchAlias: "SBB테크", themes: ["반도체"] },
  { code: "403870", name: "HPSP", searchAlias: null, themes: ["반도체"] },
  { code: "473980", name: "노머스", searchAlias: "Nomers,fromm", themes: ["플랫폼"] },
  { code: "475150", name: "SK이터닉스", searchAlias: "이터닉스", themes: ["산업"] },
];

const THEME_SEED: { name: string; description: string }[] = [
  { name: "반도체", description: "반도체·디스플레이 장비·소재" },
  { name: "플랫폼", description: "인터넷·콘텐츠·핀테크" },
  { name: "바이오", description: "바이오·제약" },
  { name: "금융", description: "증권·금융" },
  { name: "산업", description: "건설·소재·방산·에너지·완성차·전자 등" },
];

async function main() {
  const stockByCode = new Map<string, { id: string }>();

  for (const row of STOCK_SEED) {
    const s = await prisma.stock.upsert({
      where: { code: row.code },
      update: {
        name: row.name,
        searchAlias: row.searchAlias,
        isActive: true,
      },
      create: {
        code: row.code,
        name: row.name,
        searchAlias: row.searchAlias,
        isActive: true,
      },
    });
    stockByCode.set(row.code, { id: s.id });
  }

  const themeByName = new Map<string, { id: string }>();
  for (const t of THEME_SEED) {
    const row = await prisma.theme.upsert({
      where: { name: t.name },
      update: { description: t.description, isActive: true },
      create: { name: t.name, description: t.description, isActive: true },
    });
    themeByName.set(t.name, { id: row.id });
  }

  await prisma.stockThemeMap.deleteMany({});
  const mapRows: { stockId: string; themeId: string }[] = [];
  for (const row of STOCK_SEED) {
    const sid = stockByCode.get(row.code)?.id;
    if (!sid) continue;
    for (const tn of row.themes) {
      const tid = themeByName.get(tn)?.id;
      if (tid) mapRows.push({ stockId: sid, themeId: tid });
    }
  }
  await prisma.stockThemeMap.createMany({ data: mapRows });

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
    ],
  });

  const settings = [
    { key: "market_data.provider", value: "mock" },
    { key: "market_data.poll_interval_ms", value: "3000" },
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
