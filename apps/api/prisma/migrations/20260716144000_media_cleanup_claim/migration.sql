ALTER TABLE "MediaCleanupTask" ADD COLUMN "claimedAt" TIMESTAMP(3);

DROP INDEX "MediaCleanupTask_completedAt_nextAttemptAt_idx";
CREATE INDEX "MediaCleanupTask_completedAt_nextAttemptAt_claimedAt_idx"
ON "MediaCleanupTask"("completedAt", "nextAttemptAt", "claimedAt");
