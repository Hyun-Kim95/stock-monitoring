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
  }),
]);

export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
