import type { PrismaClient } from "@prisma/client";

const DEFAULT_MAX_ACTIVE = 100;
const MIN_CAP = 10;
const MAX_CAP = 500;

export async function getMaxActiveStocks(prisma: PrismaClient): Promise<number> {
  const row = await prisma.systemSetting.findUnique({
    where: { settingKey: "stocks.max_active" },
  });
  const n = Number(row?.settingValue ?? DEFAULT_MAX_ACTIVE);
  if (Number.isNaN(n)) return DEFAULT_MAX_ACTIVE;
  return Math.min(MAX_CAP, Math.max(MIN_CAP, Math.floor(n)));
}

export async function countActiveStocks(prisma: PrismaClient): Promise<number> {
  return prisma.stock.count({ where: { isActive: true } });
}
