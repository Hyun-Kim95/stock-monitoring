import { z } from "zod";

export const MarketSessionSchema = z.enum(["OPEN", "CLOSED", "PRE", "AFTER"]);

export const QuoteSnapshotSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  change: z.number(),
  changeRate: z.number(),
  volume: z.number(),
  timestamp: z.string(),
  marketSession: MarketSessionSchema,
  /** 당일 외국인 순매수 수량(주). KIS `frgn_ntby_qty`. 미제공 시 null. */
  foreignNetBuyVolume: z.number().nullable().optional(),
  /** 외국인 소진율(%). KIS `hts_frgn_ehrt`. 미제공 시 null. */
  foreignOwnershipPct: z.number().nullable().optional(),
});

export type QuoteSnapshot = z.infer<typeof QuoteSnapshotSchema>;

export const WsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    quotes: z.array(QuoteSnapshotSchema),
  }),
  z.object({
    type: z.literal("quote_update"),
    quote: QuoteSnapshotSchema,
  }),
  z.object({
    type: z.literal("status"),
    marketConnected: z.boolean(),
    message: z.string().optional(),
    /** 시세 재구성·당일 히스토리 백필 등 서버 준비 중 */
    loading: z.boolean().optional(),
  }),
]);

export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
