CREATE TABLE "MediaCleanupTask" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCleanupTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaCleanupTask_objectKey_key" ON "MediaCleanupTask"("objectKey");
CREATE INDEX "MediaCleanupTask_completedAt_nextAttemptAt_idx"
ON "MediaCleanupTask"("completedAt", "nextAttemptAt");
