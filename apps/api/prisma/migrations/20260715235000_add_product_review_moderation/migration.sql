ALTER TABLE "ProductReview"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "moderatedBy" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason" TEXT;

UPDATE "ProductReview" SET "status" = 'approved';

CREATE INDEX "ProductReview_status_createdAt_idx"
  ON "ProductReview"("status", "createdAt");
