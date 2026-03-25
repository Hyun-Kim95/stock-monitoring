import { z } from "zod";
import { normalizeKrxStockCode } from "./stock-code.js";

export const NewsRuleScopeSchema = z.enum(["GLOBAL", "STOCK"]);

export const StockCreateSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .transform((c) => normalizeKrxStockCode(c)),
  name: z.string().min(1).max(200),
  industryMajorCode: z.string().trim().min(1).max(20).optional().nullable(),
  searchAlias: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  /** 종목 등록 시 함께 연결할 테마명 목록 (미존재 시 자동 생성) */
  themeNames: z
    .array(z.string().min(1).max(200))
    .optional()
    .transform((arr) => {
      const raw = arr ?? [];
      const out: string[] = [];
      const seen = new Set<string>();
      for (const s of raw) {
        const t = s.trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out.slice(0, 50);
    }),
});

export const StockUpdateSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .transform((c) => normalizeKrxStockCode(c))
    .optional(),
  name: z.string().min(1).max(200).optional(),
  searchAlias: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const ThemeCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const ThemeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const NewsRuleCreateSchema = z.object({
  scope: NewsRuleScopeSchema,
  stockId: z.string().uuid().optional().nullable(),
  includeKeyword: z.string().max(500).optional().nullable(),
  excludeKeyword: z.string().max(500).optional().nullable(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const NewsRuleUpdateSchema = NewsRuleCreateSchema.partial();

export const ThemeStockIdsSchema = z.object({
  stockIds: z.array(z.string().uuid()),
});

export const SettingUpsertSchema = z.object({
  value: z.string().max(10000),
});
