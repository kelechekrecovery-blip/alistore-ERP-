-- Fence stale workers so an expired claimant cannot finalize a newer attempt.
ALTER TABLE "OutboxMessage"
  ADD COLUMN "processingToken" TEXT;

CREATE INDEX "OutboxMessage_status_processingToken_idx"
  ON "OutboxMessage"("status", "processingToken");
