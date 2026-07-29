ALTER TABLE "TelegramAgentMessage"
  DROP CONSTRAINT "TelegramAgentMessage_status_check";

ALTER TABLE "TelegramAgentMessage"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  ADD CONSTRAINT "TelegramAgentMessage_status_check"
    CHECK ("status" IN ('received', 'processing', 'answered', 'failed')),
  ADD CONSTRAINT "TelegramAgentMessage_attempts_check"
    CHECK ("attempts" >= 0);

CREATE INDEX "TelegramAgentMessage_expiresAt_idx"
  ON "TelegramAgentMessage"("expiresAt");
