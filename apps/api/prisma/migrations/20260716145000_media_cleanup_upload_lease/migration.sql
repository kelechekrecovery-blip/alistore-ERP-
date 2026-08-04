ALTER TABLE "MediaCleanupTask"
ADD COLUMN "uploadLeaseUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX "MediaCleanupTask_completedAt_nextAttemptAt_claimedAt_idx";
CREATE INDEX "MediaCleanupTask_completedAt_nextAttemptAt_uploadLeaseUntil_claimedAt_idx"
ON "MediaCleanupTask"("completedAt", "nextAttemptAt", "uploadLeaseUntil", "claimedAt");
