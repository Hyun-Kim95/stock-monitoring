-- CreateTable
CREATE TABLE "support_inquiry_replies" (
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inquiry_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_inquiry_replies_inquiry_id_created_at_idx" ON "support_inquiry_replies"("inquiry_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_inquiry_replies" ADD CONSTRAINT "support_inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "support_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inquiry_replies" ADD CONSTRAINT "support_inquiry_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
