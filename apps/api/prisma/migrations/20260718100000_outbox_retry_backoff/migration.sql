ALTER TABLE "OutboxMessage"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

UPDATE "OutboxMessage"
SET "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "nextAttemptAt" IS NULL;

CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx"
  ON "OutboxMessage"("status", "nextAttemptAt");
