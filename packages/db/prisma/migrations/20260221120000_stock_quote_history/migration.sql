-- CreateTable
CREATE TABLE "stock_quote_history" (
    "id" TEXT NOT NULL,
    "stock_code" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "volume" BIGINT,

    CONSTRAINT "stock_quote_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_quote_history_stock_code_recorded_at_idx" ON "stock_quote_history"("stock_code", "recorded_at" DESC);
