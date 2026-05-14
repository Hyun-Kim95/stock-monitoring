-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('GLOBAL', 'TENANT');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "scope" "AnnouncementScope" NOT NULL,
    "tenant_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "audience_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_scope_status_idx" ON "announcements"("scope", "status");

-- CreateIndex
CREATE INDEX "announcements_status_starts_at_ends_at_idx" ON "announcements"("status", "starts_at" DESC, "ends_at" DESC);

-- CreateIndex
CREATE INDEX "announcements_tenant_id_status_idx" ON "announcements"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
