-- CreateEnum
CREATE TYPE "NewsRuleScope" AS ENUM ('GLOBAL', 'STOCK');

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "stock_code" TEXT NOT NULL,
    "stock_name" TEXT NOT NULL,
    "search_alias" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "theme_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_theme_maps" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_theme_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_source_rules" (
    "id" TEXT NOT NULL,
    "scope" "NewsRuleScope" NOT NULL,
    "stock_id" TEXT,
    "include_keyword" TEXT,
    "exclude_keyword" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_source_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stocks_stock_code_key" ON "stocks"("stock_code");

-- CreateIndex
CREATE INDEX "stocks_is_active_idx" ON "stocks"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "themes_theme_name_key" ON "themes"("theme_name");

-- CreateIndex
CREATE INDEX "stock_theme_maps_stock_id_idx" ON "stock_theme_maps"("stock_id");

-- CreateIndex
CREATE INDEX "stock_theme_maps_theme_id_idx" ON "stock_theme_maps"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_theme_maps_stock_id_theme_id_key" ON "stock_theme_maps"("stock_id", "theme_id");

-- CreateIndex
CREATE INDEX "news_source_rules_scope_is_active_idx" ON "news_source_rules"("scope", "is_active");

-- CreateIndex
CREATE INDEX "news_source_rules_stock_id_idx" ON "news_source_rules"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- AddForeignKey
ALTER TABLE "stock_theme_maps" ADD CONSTRAINT "stock_theme_maps_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_theme_maps" ADD CONSTRAINT "stock_theme_maps_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_rules" ADD CONSTRAINT "news_source_rules_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
