-- Tenant + Auth + Preference MVP
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'KAKAO', 'NAVER');

CREATE TABLE "tenants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "avatar_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");
CREATE INDEX "memberships_tenant_id_role_idx" ON "memberships"("tenant_id", "role");

CREATE TABLE "oauth_accounts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "OAuthProvider" NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

CREATE TABLE "user_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "pinned_stock_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "filter_text" TEXT NOT NULL DEFAULT '',
  "market_filter" TEXT NOT NULL DEFAULT 'ALL',
  "session_filter" TEXT NOT NULL DEFAULT 'ALL',
  "nxt_filter" TEXT NOT NULL DEFAULT 'ALL',
  "theme_filter_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "change_alert_threshold" INTEGER,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

INSERT INTO "tenants" ("id", "name", "created_at", "updated_at")
VALUES ('default-tenant', 'Default Tenant', NOW(), NOW())
ON CONFLICT DO NOTHING;

ALTER TABLE "stocks" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "themes" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "stock_theme_maps" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "news_source_rules" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "tenant_id" TEXT;

UPDATE "stocks" SET "tenant_id" = 'default-tenant' WHERE "tenant_id" IS NULL;
UPDATE "themes" SET "tenant_id" = 'default-tenant' WHERE "tenant_id" IS NULL;
UPDATE "stock_theme_maps" SET "tenant_id" = 'default-tenant' WHERE "tenant_id" IS NULL;
UPDATE "news_source_rules" SET "tenant_id" = 'default-tenant' WHERE "tenant_id" IS NULL;
UPDATE "system_settings" SET "tenant_id" = 'default-tenant' WHERE "tenant_id" IS NULL;

ALTER TABLE "stocks" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "themes" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "stock_theme_maps" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "news_source_rules" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "system_settings" ALTER COLUMN "tenant_id" SET NOT NULL;

DROP INDEX IF EXISTS "stocks_stock_code_key";
CREATE UNIQUE INDEX "stocks_tenant_id_stock_code_key" ON "stocks"("tenant_id", "stock_code");
CREATE INDEX "stocks_tenant_id_is_active_idx" ON "stocks"("tenant_id", "is_active");

DROP INDEX IF EXISTS "themes_theme_name_key";
CREATE UNIQUE INDEX "themes_tenant_id_theme_name_key" ON "themes"("tenant_id", "theme_name");
CREATE INDEX "themes_tenant_id_is_active_idx" ON "themes"("tenant_id", "is_active");

DROP INDEX IF EXISTS "stock_theme_maps_stock_id_theme_id_key";
CREATE UNIQUE INDEX "stock_theme_maps_tenant_id_stock_id_theme_id_key" ON "stock_theme_maps"("tenant_id", "stock_id", "theme_id");
CREATE INDEX "stock_theme_maps_tenant_id_stock_id_idx" ON "stock_theme_maps"("tenant_id", "stock_id");
CREATE INDEX "stock_theme_maps_tenant_id_theme_id_idx" ON "stock_theme_maps"("tenant_id", "theme_id");

DROP INDEX IF EXISTS "news_source_rules_scope_is_active_idx";
DROP INDEX IF EXISTS "news_source_rules_stock_id_idx";
CREATE INDEX "news_source_rules_tenant_id_scope_is_active_idx" ON "news_source_rules"("tenant_id", "scope", "is_active");
CREATE INDEX "news_source_rules_tenant_id_stock_id_idx" ON "news_source_rules"("tenant_id", "stock_id");

DROP INDEX IF EXISTS "system_settings_setting_key_key";
CREATE UNIQUE INDEX "system_settings_tenant_id_setting_key_key" ON "system_settings"("tenant_id", "setting_key");
CREATE INDEX "system_settings_tenant_id_setting_key_idx" ON "system_settings"("tenant_id", "setting_key");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stocks" ADD CONSTRAINT "stocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "themes" ADD CONSTRAINT "themes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_theme_maps" ADD CONSTRAINT "stock_theme_maps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "news_source_rules" ADD CONSTRAINT "news_source_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
