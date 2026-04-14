import type { PrismaClient } from "@prisma/client";
import { fetchNaverStockIntegrationMeta } from "./naver-stock-integration.js";
import { mergeFormerOfficialNameIntoSearchAlias } from "./stock-search-alias.js";

/** 종목코드당 네이버 integration 조회 최소 간격 (부하·차단 완화) */
const OFFICIAL_NAME_SYNC_INTERVAL_MS = 6 * 3600 * 1000;

const lastOfficialNameSyncAt = new Map<string, number>();

export function __resetOfficialNameSyncCacheForTests(): void {
  lastOfficialNameSyncAt.clear();
}

/**
 * 네이버 모바일 `stockName`이 DB와 다르면 공식명을 맞추고, 구명은 `searchAlias`에 합친다.
 * @returns DB가 갱신되었으면 true
 */
export async function trySyncStockOfficialName(
  prisma: PrismaClient,
  row: { id: string; code: string; name: string; searchAlias: string | null },
): Promise<boolean> {
  const now = Date.now();
  if (now - (lastOfficialNameSyncAt.get(row.code) ?? 0) < OFFICIAL_NAME_SYNC_INTERVAL_MS) {
    return false;
  }

  let meta: Awaited<ReturnType<typeof fetchNaverStockIntegrationMeta>>;
  try {
    meta = await fetchNaverStockIntegrationMeta(row.code);
  } catch {
    return false;
  }

  lastOfficialNameSyncAt.set(row.code, Date.now());

  const official = meta.officialName?.trim();
  if (!official || official === row.name.trim()) {
    return false;
  }

  const merged = mergeFormerOfficialNameIntoSearchAlias({
    priorOfficialName: row.name,
    baseSearchAlias: row.searchAlias,
    newOfficialName: official,
  });

  await prisma.stock.update({
    where: { id: row.id },
    data: { name: official, searchAlias: merged },
  });
  return true;
}

/** 활성 종목 목록에 대해 동기화(소량 동시 + 간격). 하나라도 갱신되면 true */
export async function syncOfficialNamesBatch(
  prisma: PrismaClient,
  rows: Array<{ id: string; code: string; name: string; searchAlias: string | null }>,
): Promise<boolean> {
  let any = false;
  const chunkSize = 4;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const outs = await Promise.all(chunk.map((r) => trySyncStockOfficialName(prisma, r)));
    if (outs.some(Boolean)) any = true;
    if (i + chunkSize < rows.length) {
      await new Promise((res) => setTimeout(res, 120));
    }
  }
  return any;
}
