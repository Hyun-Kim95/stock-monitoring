-- 이미 컬럼이 있으면 스킵(db push·수동 반영 후 migrate deploy 충돌 방지)
ALTER TABLE "stocks" ADD COLUMN IF NOT EXISTS "industry_major_code" TEXT;
